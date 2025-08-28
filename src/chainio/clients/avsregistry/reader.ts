import { Address, Contract, utils, Web3 } from "web3";
import { ethers, Result } from "ethers";
import { Logger } from "pino";
import * as ABIs from "../../../contracts/ABIs";
import * as chainioUtils from "../../utils";
import {
    BlockNumber,
    OperatorId,
    OperatorStateRetrieverOperator,
    OperatorStateRetrieverCheckSignaturesIndices,
    QuorumNum,
    StrategyParams,
    Uint8,
    StakeUpdate,
    ApkUpdate,
    OperatorPubkeys,
    Uint96,
    Uint32,
    Uint192,
    Uint256,
    Bytes,
    Operator,
} from "../../../types/general";
import { G1Point, G2Point } from "../../../crypto/bls/attestation";
import { obj2arr } from "../../../utils/helpers.js";

const DEFAULT_QUERY_BLOCK_RANGE = 10_000n;

export class AvsRegistryReader {
    constructor(
        public readonly registryCoordinator: Contract<
            typeof ABIs.REGISTRY_COORDINATOR_ABI
        >,
        public readonly registryCoordinatorAddr: Address,
        public readonly blsApkRegistry: Contract<
            typeof ABIs.BLS_APK_REGISTRY_ABI
        >,
        public readonly blsApkRegistryAddr: Address,
        public readonly operatorStateRetriever: Contract<
            typeof ABIs.OPERATOR_STATE_RETRIEVER_ABI
        >,
        public readonly serviceManager: Contract<
            typeof ABIs.SERVICE_MANAGER_BASE_ABI
        >,
        public readonly stakeRegistry: Contract<typeof ABIs.STAKE_REGISTRY_ABI>,
        public readonly logger: Logger,
        public readonly ethHttpClient: Web3,
    ) {}

    async getQuorumCount(): Promise<Uint8> {
        return await this.registryCoordinator.methods.quorumCount().call();
    }

    async getOperatorsStakeInQuorumsAtCurrentBlock(
        quorumNumbers: QuorumNum[],
    ): Promise<OperatorStateRetrieverOperator[][]> {
        const curBlock: bigint = await this.ethHttpClient.eth.getBlockNumber();
        return await this.getOperatorsStakeInQuorumsAtBlock(
            quorumNumbers,
            curBlock,
        );
    }

    async getOperatorsStakeInQuorumsAtBlock(
        quorumNumbers: QuorumNum[],
        blockNumber: BlockNumber,
    ): Promise<OperatorStateRetrieverOperator[][]> {
        const quorumBytes = chainioUtils.numsToBytes(quorumNumbers.map(Number));
        const operatorStakes = await this.operatorStateRetriever.methods[
            "getOperatorState(address,bytes,uint32)"
        ](this.registryCoordinatorAddr, quorumBytes, blockNumber).call();

        // @ts-ignore
        return operatorStakes.map((quorum: any[]) =>
            quorum.map((operator) => ({
                operator: operator[0],
                operatorId: operator[1],
                stake: operator[2],
            })),
        );
    }

    async getOperatorAddrsInQuorumsAtCurrentBlock(
        quorumNumbers: QuorumNum[],
    ): Promise<string[][]> {
        const curBlock = await this.ethHttpClient.eth.getBlockNumber();
        const stakes = await this.getOperatorsStakeInQuorumsAtBlock(
            quorumNumbers,
            curBlock,
        );
        return stakes.map((quorum) => quorum.map((op) => op.operator));
    }

    async getOperatorsStakeInQuorumsOfOperatorAtBlock(
        operatorId: string,
        blockNumber: BlockNumber,
    ): Promise<[number[], OperatorStateRetrieverOperator[][]]> {
        const result: any = await this.operatorStateRetriever.methods[
            "getOperatorState(address,bytes32,uint32)"
        ](this.registryCoordinatorAddr, operatorId, blockNumber).call();
        const quorumBitmap = result[0];
        const operatorStakes = result[1];

        const quorums = chainioUtils.bitmapToQuorumIds(quorumBitmap);
        return [
            quorums,
            operatorStakes.map((quorum: any[]) =>
                quorum.map((operator) => ({
                    operator: operator[0],
                    operatorId: operator[1],
                    stake: operator[2],
                })),
            ),
        ];
    }

    async getOperatorsStakeInQuorumsOfOperatorAtCurrentBlock(
        operatorId: string,
    ): Promise<[number[], OperatorStateRetrieverOperator[][]]> {
        const curBlock = await this.ethHttpClient.eth.getBlockNumber();
        return await this.getOperatorsStakeInQuorumsOfOperatorAtBlock(
            operatorId,
            curBlock,
        );
    }

    async getOperatorStakeInQuorumsOfOperatorAtCurrentBlock(
        operatorId: string,
    ): Promise<{ [key: number]: number }> {
        const quorumBitmap: bigint = await this.registryCoordinator.methods
            .getCurrentQuorumBitmap(operatorId)
            .call();
        const quorums = chainioUtils.bitmapToQuorumIds(quorumBitmap);
        const result: { [key: number]: number } = {};
        for (const quorum of quorums) {
            result[quorum] = await this.stakeRegistry.methods
                .getCurrentStake(operatorId, quorum)
                .call();
        }
        return result;
    }

    async weightOfOperatorForQuorum(
        quorumNumber: QuorumNum,
        operatorAddr: string,
    ): Promise<Uint96> {
        return await this.stakeRegistry.methods
            .weightOfOperatorForQuorum(quorumNumber, operatorAddr)
            .call();
    }

    async strategyParamsLength(quorumNumber: QuorumNum): Promise<Uint256> {
        return await this.stakeRegistry.methods
            .strategyParamsLength(quorumNumber)
            .call();
    }

    async strategyParamsByIndex(
        quorumNumber: QuorumNum,
        index: Uint256,
    ): Promise<StrategyParams> {
        const result: [string, Uint96] = obj2arr(
            await this.stakeRegistry.methods
                .strategyParamsByIndex(quorumNumber, index)
                .call(),
        );
        return {
            strategy: result[0],
            multiplier: result[1],
        };
    }

    async getStakeHistoryLength(
        operatorId: string,
        quorumNumber: QuorumNum,
    ): Promise<Uint256> {
        return await this.stakeRegistry.methods
            .getStakeHistoryLength(operatorId, quorumNumber)
            .call();
    }

    async getStakeHistory(
        operatorId: string,
        quorumNumber: QuorumNum,
    ): Promise<StakeUpdate[]> {
        const history: [Uint32, Uint32, Uint96][] =
            await this.stakeRegistry.methods
                .getStakeHistory(operatorId, quorumNumber)
                .call();
        return history.map((update) => ({
            updateBlockNumber: update[0],
            nextUpdateBlockNumber: update[1],
            stake: update[2],
        }));
    }

    async getLatestStakeUpdate(
        operatorId: string,
        quorumNumber: QuorumNum,
    ): Promise<StakeUpdate> {
        const update = await this.stakeRegistry.methods
            .getLatestStakeUpdate(operatorId, quorumNumber)
            .call();
        return {
            updateBlockNumber: update[0],
            nextUpdateBlockNumber: update[1],
            stake: update[2],
        };
    }

    async getStakeUpdateAtIndex(
        operatorId: string,
        quorumNumber: QuorumNum,
        index: Uint256,
    ): Promise<StakeUpdate> {
        const update: [Uint32, Uint32, Uint96] = obj2arr(
            await this.stakeRegistry.methods
                .getStakeUpdateAtIndex(quorumNumber, operatorId, index)
                .call(),
        );
        return {
            updateBlockNumber: update[0],
            nextUpdateBlockNumber: update[1],
            stake: update[2],
        };
    }

    async getStakeAtBlockNumber(
        operatorId: string,
        quorumNumber: QuorumNum,
        blockNumber: BlockNumber,
    ): Promise<Uint96> {
        return await this.stakeRegistry.methods
            .getStakeAtBlockNumber(operatorId, quorumNumber, blockNumber)
            .call();
    }

    async getStakeUpdateIndexAtBlockNumber(
        operatorId: string,
        quorumNumber: QuorumNum,
        blockNumber: BlockNumber,
    ): Promise<Uint32> {
        return await this.stakeRegistry.methods
            .getStakeUpdateIndexAtBlockNumber(
                operatorId,
                quorumNumber,
                blockNumber,
            )
            .call();
    }

    async getTotalStakeHistoryLength(
        quorumNumber: QuorumNum,
    ): Promise<Uint256> {
        return await this.stakeRegistry.methods
            .getTotalStakeHistoryLength(quorumNumber)
            .call();
    }

    async getCheckSignaturesIndices(
        referenceBlockNumber: BlockNumber,
        quorumNumbers: QuorumNum[],
        nonSignerOperatorIds: string[],
    ): Promise<OperatorStateRetrieverCheckSignaturesIndices> {
        const quorumBytes = chainioUtils.numsToBytes(quorumNumbers.map(Number));
        const result = await this.operatorStateRetriever.methods
            .getCheckSignaturesIndices(
                this.registryCoordinatorAddr,
                referenceBlockNumber,
                quorumBytes,
                nonSignerOperatorIds,
            )
            .call();
        return {
            nonSignerQuorumBitmapIndices: result[0],
            quorumApkIndices: result[1],
            totalStakeIndices: result[2],
            nonSignerStakeIndices: result[3],
        };
    }

    async getCurrentTotalStake(quorumNumber: QuorumNum): Promise<Uint96> {
        return await this.stakeRegistry.methods
            .getCurrentTotalStake(quorumNumber)
            .call();
    }

    async getTotalStakeUpdateAtIndex(
        quorumNumber: QuorumNum,
        index: Uint256,
    ): Promise<StakeUpdate> {
        const update: [Uint32, Uint32, Uint96] = obj2arr(
            await this.stakeRegistry.methods
                .getTotalStakeUpdateAtIndex(quorumNumber, index)
                .call(),
        );
        return {
            updateBlockNumber: update[0],
            nextUpdateBlockNumber: update[1],
            stake: update[2],
        };
    }

    async getTotalStakeAtBlockNumberFromIndex(
        quorumNumber: QuorumNum,
        blockNumber: BlockNumber,
        index: Uint256,
    ): Promise<Uint96> {
        return await this.stakeRegistry.methods
            .getTotalStakeAtBlockNumberFromIndex(
                quorumNumber,
                blockNumber,
                index,
            )
            .call();
    }

    async getTotalStakeIndicesAtBlockNumber(
        quorumNumbers: QuorumNum[],
        blockNumber: BlockNumber,
    ): Promise<Uint32[]> {
        const quorumBytes = chainioUtils.numsToBytes(quorumNumbers.map(Number));
        return await this.stakeRegistry.methods
            .getTotalStakeIndicesAtBlockNumber(blockNumber, quorumBytes)
            .call();
    }

    async getMinimumStakeForQuorum(quorumNumber: QuorumNum): Promise<Uint96> {
        return await this.stakeRegistry.methods
            .minimumStakeForQuorum(quorumNumber)
            .call();
    }

    async getStrategyParamsAtIndex(
        quorumNumber: QuorumNum,
        index: Uint256,
    ): Promise<StrategyParams> {
        return await this.stakeRegistry.methods
            .strategyParams(quorumNumber, index)
            .call();
    }

    async getStrategyPerQuorumAtIndex(
        quorumNumber: QuorumNum,
        index: Uint256,
    ): Promise<string> {
        return await this.stakeRegistry.methods
            .strategiesPerQuorum(quorumNumber, index)
            .call();
    }

    async getRestakeableStrategies(): Promise<string[]> {
        return await this.serviceManager.methods
            .getRestakeableStrategies()
            .call();
    }

    async getOperatorRestakedStrategies(operator: string): Promise<string[]> {
        return await this.serviceManager.methods
            .getOperatorRestakedStrategies(operator)
            .call();
    }

    async getStakeTypePerQuorum(quorumNumber: QuorumNum): Promise<Uint8> {
        return await this.stakeRegistry.methods
            .stakeTypePerQuorum(quorumNumber)
            .call();
    }

    async getSlashableStakeLookAheadPerQuorum(
        quorumNumber: QuorumNum,
    ): Promise<Uint32> {
        return await this.stakeRegistry.methods
            .slashableStakeLookAheadPerQuorum(quorumNumber)
            .call();
    }

    async getOperatorId(operatorAddress: Address): Promise<string> {
        return await this.registryCoordinator.methods
            .getOperatorId(operatorAddress)
            .call();
    }

    async getOperatorFromId(operatorId: string): Promise<string> {
        return await this.registryCoordinator.methods
            .getOperatorFromId(operatorId)
            .call();
    }

    async queryRegistrationDetail(
        operatorAddress: Address,
    ): Promise<boolean[]> {
        const operatorId = await this.getOperatorId(operatorAddress);
        const value: Uint192 = await this.registryCoordinator.methods
            .getCurrentQuorumBitmap(operatorId)
            .call();
        const bits: boolean[] = [];
        for (let i = 0; i < value.toString(2).length; i++) {
            bits.push((value & BigInt(1 << i)) !== 0n);
        }
        return bits;
    }

    // async isOperatorRegistered(operatorAddress: string): Promise<boolean> {
    //     const status: Uint8 = await this.registryCoordinator.methods.getOperatorStatus(operatorAddress).call()
    //     return status == 1n;
    // }

    // async isOperatorSetQuorum(quorumNumber: QuorumNum): Promise<boolean> {
    //     return await this.stakeRegistry.methods.isOperatorSetQuorum(quorumNumber).call();
    // }

    async getOperatorIdFromOperatorAddress(
        operatorAddress: string,
    ): Promise<string> {
        return await this.blsApkRegistry.methods
            .operatorToPubkeyHash(operatorAddress)
            .call();
    }

    async getOperatorAddressFromOperatorId(
        operatorPubkeyHash: string,
    ): Promise<string> {
        return await this.blsApkRegistry.methods
            .pubkeyHashToOperator(operatorPubkeyHash)
            .call();
    }

    async getPubkeyFromOperatorAddress(
        operatorAddress: string,
    ): Promise<G1Point> {
        const operatorPubkey: [Uint256, Uint256] = obj2arr(
            await this.blsApkRegistry.methods
                .operatorToPubkey(operatorAddress)
                .call(),
        );
        return new G1Point(operatorPubkey[0], operatorPubkey[1]);
    }

    async getApkUpdate(
        quorumNumber: QuorumNum,
        index: Uint256,
    ): Promise<ApkUpdate> {
        const update: [Bytes, Uint32, Uint32] = obj2arr(
            await this.blsApkRegistry.methods
                .apkHistory(quorumNumber, index)
                .call(),
        );
        return {
            apkHash: update[0],
            updateBlockNumber: update[1],
            nextUpdateBlockNumber: update[2],
        };
    }

    async getCurrentApk(quorumNumber: QuorumNum): Promise<G1Point> {
        const apk: [Uint256, Uint256] = obj2arr(
            await this.blsApkRegistry.methods.currentApk(quorumNumber).call(),
        );
        return new G1Point(apk[0], apk[1]);
    }

    async queryExistingRegisteredOperatorSockets(
        startBlock: BlockNumber = 0n,
        stopBlock?: BlockNumber,
        blockRange: bigint = DEFAULT_QUERY_BLOCK_RANGE,
    ): Promise<[Record<string, string>, BlockNumber]> {
        if (stopBlock === undefined) {
            stopBlock = await this.ethHttpClient.eth.getBlockNumber();
        }

        const operatorIdToSocketMap: Record<string, string> = {};

        const eventAbi =
            this.registryCoordinator.events.OperatorSocketUpdate().abi;
        // const eventTopic = ethers.id('OperatorSocketUpdate(bytes32,string)');
        const eventTopic =
            this.ethHttpClient.eth.abi.encodeEventSignature(eventAbi);

        for (let i = startBlock; i <= stopBlock; i += blockRange) {
            const toBlock: BlockNumber = chainioUtils.min(
                i + blockRange - 1n,
                stopBlock,
            );

            try {
                const logs = await this.ethHttpClient.eth.getPastLogs({
                    fromBlock: i,
                    toBlock: toBlock,
                    // address: this.registryCoordinator.options.address,
                    address: this.registryCoordinatorAddr,
                    topics: [eventTopic],
                });

                const iface = new ethers.Interface([eventAbi]);
                // @ts-ignore
                const decodedLogs = logs.map((log) => iface.parseLog(log));

                for (const log of decodedLogs) {
                    // operatorIdToSocketMap[log.operatorId] = log.socket;
                    if (log) {
                        const operator_id = log.args.operatorId as string;
                        const socket = log.args.socket as string;
                        operatorIdToSocketMap[operator_id] = socket;
                    }
                }

                this.logger.debug(
                    "avsRegistryChainReader.queryExistingRegisteredOperatorSockets",
                    {
                        numTransactionLogs: decodedLogs.length,
                        fromBlock: i,
                        toBlock: toBlock,
                    },
                );
            } catch (e) {
                this.logger.warn(
                    `Failed to fetch logs for blocks ${i}-${toBlock}: ${e}`,
                );
                continue;
            }
        }

        return [operatorIdToSocketMap, stopBlock];
    }

    async queryExistingRegisteredOperatorPubkeys(
        startBlock: BlockNumber = 0n,
        stopBlock?: BlockNumber,
        blockRange: BlockNumber = DEFAULT_QUERY_BLOCK_RANGE,
    ): Promise<[Address[], OperatorPubkeys[]]> {
        if (stopBlock === undefined) {
            stopBlock = await this.ethHttpClient.eth.getBlockNumber();
        }

        const operatorPubkeys: OperatorPubkeys[] = [];
        const operatorAddresses: Address[] = [];

        for (let i = startBlock; i <= stopBlock; i += blockRange) {
            const toBlock = chainioUtils.min(i + blockRange - 1n, stopBlock);

            const eventAbi =
                this.blsApkRegistry.events.NewPubkeyRegistration().abi;
            // const eventTopic = ethers.id('NewPubkeyRegistration(address,(uint256,uint256),(uint256[2],uint256[2]))');
            const eventTopic =
                this.ethHttpClient.eth.abi.encodeEventSignature(eventAbi);

            const logs = await this.ethHttpClient.eth.getPastLogs({
                fromBlock: i,
                toBlock: toBlock,
                // address: this.blsApkRegistry.options.address,
                address: this.blsApkRegistryAddr,
                topics: [eventTopic],
            });

            const iface = new ethers.Interface([eventAbi]);
            // @ts-ignore
            const decodedLogs = logs.map((log) => iface.parseLog(log));

            this.logger.debug(
                "avsRegistryChainReader.queryExistingRegisteredOperatorPubkeys",
                {
                    numTransactionLogs: decodedLogs.length,
                    fromBlock: i,
                    toBlock: toBlock,
                },
            );

            for (const log of decodedLogs) {
                if (log) {
                    const operatorAddr = log.args.operator as string;
                    const pubkeyG1 = log.args.pubkeyG1 as [bigint, bigint];
                    const pubkeyG2 = log.args.pubkeyG2 as {
                        X: [bigint, bigint];
                        Y: [bigint, bigint];
                    };
                    operatorPubkeys.push({
                        g1PubKey: new G1Point(pubkeyG1[0], pubkeyG1[1]),
                        g2PubKey: new G2Point(
                            pubkeyG2.X[0],
                            pubkeyG2.X[1],
                            pubkeyG2.Y[0],
                            pubkeyG2.Y[1],
                        ),
                    });
                    operatorAddresses.push(operatorAddr);
                }
            }
        }

        return [operatorAddresses, operatorPubkeys];
    }

    async getRegistryCoordinatorOwner(): Promise<string> {
        return await this.registryCoordinator.methods.owner().call();
    }

    async isRegistryCoordinatorOwner(address: string): Promise<boolean> {
        const owner = await this.getRegistryCoordinatorOwner();
        return owner.toLowerCase() === address.toLowerCase();
    }

    async canSatisfyOnlyCoordinatorOwnerModifier(
        address: string,
    ): Promise<boolean> {
        return await this.isRegistryCoordinatorOwner(address);
    }
}
