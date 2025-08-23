// import { ethers } from "ethers";
import { pino, Logger } from "pino";
// import { ELReader, G1Point, KeyPair, TxReceipt, utils, sendTransaction } from "./utils";
import { ELReader } from '../elcontracts/reader'
import { Web3, Contract, Address, TransactionReceipt } from "web3";
import { ethers } from 'ethers'
import { G1Point, KeyPair, Signature } from "../../../crypto/bls/attestation";
import * as chainIoUtils from '../../utils'
import { sendContractCall } from '../../utils.js'
import * as ABIs from '../../../contracts/ABIs'
import { 
    LocalAccount, OperatorDirectedRewardsSubmission, 
    OperatorSetParams, QuorumNum, RewardsSubmission, 
    StrategyParams, Uint16, Uint256, Uint32, Uint8, Uint96 
} from "../../../types/general";
import { signRawData } from "../../../utils/helpers";

const DEFAULT_QUERY_BLOCK_RANGE = 10_000;
const logger = pino({ 
    level: process.env.LOG_LEVEL || "silent",
    name: "AvsRegWriter" 
})


export class AvsRegistryWriter {

    constructor(
        public readonly registryCoordinator: Contract<typeof ABIs.REGISTRY_COORDINATOR_ABI>,
        public readonly operatorStateRetriever: Contract<typeof ABIs.OPERATOR_STATE_RETRIEVER_ABI>,
        public readonly serviceManager: Contract<typeof ABIs.SERVICE_MANAGER_BASE_ABI>,
        public readonly serviceManagerAddr: Address,
        public readonly stakeRegistry: Contract<typeof ABIs.STAKE_REGISTRY_ABI>,
        public readonly blsApkRegistry: Contract<typeof ABIs.BLS_APK_REGISTRY_ABI>,
        public readonly elReader: ELReader,
        public readonly logger: Logger,
        public readonly ethHttpClient: Web3,
        public readonly pkWallet: LocalAccount,
    ) {}

    async updateStakesOfEntireOperatorSetForQuorums(
        operatorsPerQuorum: string[][],
        quorumNumbers: QuorumNum[]
    ): Promise<TransactionReceipt> {
        const quorumBytes = chainIoUtils.numsToBytes(quorumNumbers.map(Number));
        let sortedOperatorsPerQuorum: string[][] = []
        for(let operators of operatorsPerQuorum) {
            sortedOperatorsPerQuorum.push(chainIoUtils.sortEthAddresses([...operators]))
        }
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'updateOperatorsForQuorum',
            params: [sortedOperatorsPerQuorum, quorumBytes],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async updateStakesOfOperatorSubsetForAllQuorums(
        operators: string[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'updateOperators',
            params: [operators],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async updateSocket(socket: string): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'updateSocket',
            params: [socket],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setRewardsInitiator(rewardsInitiatorAddr: string): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.serviceManager,
            method: 'setRewardsInitiator',
            params: [rewardsInitiatorAddr],
            abi: ABIs.SERVICE_MANAGER_BASE_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setSlashableStakeLookahead(
        quorumNumber: Uint8,
        lookAheadPeriod: Uint32
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.stakeRegistry,
            method: 'setSlashableStakeLookahead',
            params: [quorumNumber, lookAheadPeriod],
            abi: ABIs.STAKE_REGISTRY_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setMinimumStakeForQuorum(
        quorumNumber: number,
        minimumStake: number
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.stakeRegistry,
            method: 'setMinimumStakeForQuorum',
            params: [quorumNumber, minimumStake],
            abi: ABIs.STAKE_REGISTRY_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async createTotalDelegatedStakeQuorum(
        operatorSetParams: OperatorSetParams,
        minimumStakeRequired: Uint96,
        strategyParams: StrategyParams[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'createTotalDelegatedStakeQuorum',
            params: [operatorSetParams, minimumStakeRequired, strategyParams],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async createSlashableStakeQuorum(
        operatorSetParams: OperatorSetParams,
        minimumStakeRequired: Uint96,
        strategyParams: StrategyParams[],
        lookAheadPeriod: Uint32
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'createSlashableStakeQuorum',
            params: [operatorSetParams, minimumStakeRequired, strategyParams, lookAheadPeriod],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async ejectOperator(
        operatorAddress: string,
        quorumNumbers: QuorumNum[]
    ): Promise<TransactionReceipt> {
        const quorumBytes = chainIoUtils.numsToBytes(quorumNumbers.map(Number));
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'ejectOperator',
            params: [operatorAddress, quorumBytes],
            abi: [...ABIs.REGISTRY_COORDINATOR_ABI, ...ABIs.ALLOCATION_MANAGER_ABI],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setOperatorSetParams(
        quorumNumber: QuorumNum,
        operatorSetParams: OperatorSetParams
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'setOperatorSetParams',
            params: [quorumNumber, operatorSetParams],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setChurnApprover(churnApproverAddress: string): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'setChurnApprover',
            params: [churnApproverAddress],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setEjector(ejectorAddress: string): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'setEjector',
            params: [ejectorAddress],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async modifyStrategyParams(
        quorumNumber: number,
        strategyIndices: number[],
        multipliers: number[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.stakeRegistry,
            method: 'modifyStrategyParams',
            params: [quorumNumber, strategyIndices, multipliers],
            abi: ABIs.STAKE_REGISTRY_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setAvs(avsAddress: string): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'setAVS',
            params: [avsAddress],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async setEjectionCooldown(ejectionCooldown: number): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.registryCoordinator,
            method: 'setEjectionCooldown',
            params: [ejectionCooldown],
            abi: ABIs.REGISTRY_COORDINATOR_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async addStrategies(
        quorumNumber: Uint8,
        strategyParams: StrategyParams[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.stakeRegistry,
            method: 'addStrategies',
            params: [quorumNumber, strategyParams],
            abi: ABIs.STAKE_REGISTRY_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async updateAvsMetadataUri(metadataUri: string): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.serviceManager,
            method: 'updateAVSMetadataURI',
            params: [metadataUri],
            abi: ABIs.SERVICE_MANAGER_BASE_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async removeStrategies(
        quorumNumber: Uint8,
        indicesToRemove: Uint256[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.stakeRegistry,
            method: 'removeStrategies',
            params: [quorumNumber, indicesToRemove],
            abi: [
                ...ABIs.STAKE_REGISTRY_ABI,
                ...ABIs.ALLOCATION_MANAGER_ABI,
            ],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async createAvsRewardsSubmission(
        rewardsSubmission: RewardsSubmission[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.serviceManager,
            method: 'createAVSRewardsSubmission',
            params: [rewardsSubmission],
            abi: ABIs.SERVICE_MANAGER_BASE_ABI,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }

    async createOperatorDirectedAvsRewardsSubmission(
        operatorDirectedRewardsSubmission: OperatorDirectedRewardsSubmission[]
    ): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract: this.serviceManager,
            method: 'createOperatorDirectedAVSRewardsSubmission',
            params: [operatorDirectedRewardsSubmission],
            abi: Object.values(ABIs).flat(),
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient
        });
    }
}