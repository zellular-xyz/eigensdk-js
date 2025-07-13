import { Logger } from 'pino'
import { Contract, Web3, Address } from "web3";
import { AbiItem } from "web3-utils";
import * as ABIs from '../../../contracts/ABIs'
import { 
    Bytes, Uint256, Uint64, Uint32, Uint128, 
    Uint8, BlockNumber, Uint16, OperatorSet, 
    SlashableStake 
} from '../../../types/general';


type AllocationInfo = {
    operatorSetId: Uint32,
    avsAddress: string,
    currentMagnitude: Uint64, // uint96 as string
    pendingDiff: Uint128, // uint96 as string
    effectBlock: Uint32
}

type OperatorDetails = Record<string, any>;

type DistributionRoot = {
    root: Bytes,
    rewardsCalculationEndTimestamp: Uint32,
    activatedAt: Uint32,
    disabled: boolean
}

export type ClaimCheckParams = {
    rootIndex: Uint32,
    earnerIndex: Uint32,
    earnerTreeProof: Bytes,
    earnerLeaf: {
        earner: string,
        earnerTokenRoot: Bytes
    },
    tokenIndices: Uint32[],
    tokenTreeProofs: Bytes[],
    tokenLeaves: {
        token: string,
        cumulativeEarnings: Uint256
    }[],
}

export class ELReader {
    constructor(
        private readonly allocationManager: Contract<typeof ABIs.ALLOCATION_MANAGER_ABI>,
        private readonly avsDirectory: Contract<typeof ABIs.AVS_DIRECTORY_ABI>,
        private readonly delegationManager: Contract<typeof ABIs.DELEGATION_MANAGER_ABI>,
        private readonly permissionController: Contract<typeof ABIs.PERMISSION_CONTROLLER_ABI>,
        private readonly rewardCoordinator: Contract<typeof ABIs.REWARDS_COORDINATOR_ABI>,
        private readonly strategyManager: Contract<typeof ABIs.STRATEGY_MANAGER_ABI>,
        private readonly logger: Logger,
        private readonly web3: Web3,
        private readonly strategyAbi: AbiItem[],
        private readonly erc20Abi: AbiItem[]
    ) { }

    async getAllocatableMagnitude(operatorAddr?: string, strategyAddr?: string): Promise<Uint64> {
        try {
            const result: Uint64 = await this.allocationManager.methods
                .getAllocatableMagnitude(operatorAddr, strategyAddr)
                .call();
            return result; // Safe for small uint96 values
        } catch (error) {
            this.logger.error(`Error in getAllocatableMagnitude: ${error.message}`);
            throw error;
        }
    }

    // TODO STA: check contract source to match ? operator
    // TODO STA: there is two getMaxMagnitudes overload
    async getMaxMagnitudes(
        operatorAddr?: string,
        strategyAddrs?: string[]
    ): Promise<bigint[]> {
        try {
            const result: bigint[] = await this.allocationManager.methods
                ["getMaxMagnitudes(address,address[])"](operatorAddr, strategyAddrs)
                .call();
            return result; // Safe for small uint96 values
        } catch (error) {
            this.logger.error(`Error in getMaxMagnitudes: ${error.message}`);
            throw error;
        }
    }

    async getAllocationInfo(
        operatorAddr?: string,
        strategyAddr?: string
    ): Promise<AllocationInfo[]> {
        try {
            const [sets, allocations]: [[string, bigint][], [bigint, bigint, bigint][]] =
                await this.allocationManager.methods
                    .getStrategyAllocations(operatorAddr, strategyAddr)
                    .call();
            return sets.map(([avs, id], index) => ({
                operatorSetId: id,
                avsAddress: avs,
                currentMagnitude: allocations[index][0], // uint96 as string
                pendingDiff: allocations[index][1], // uint96 as string
                effectBlock: allocations[index][2]
            }));
        } catch (error) {
            this.logger.error(`Error in getAllocationInfo: ${error.message}`);
            throw error;
        }
    }

    async getOperatorShares(
        operatorAddress: string,
        strategyAddresses: string[]
    ): Promise<Uint256[]> {
        try {
            const result: Uint256[] = await this.delegationManager.methods
                .getOperatorShares(operatorAddress, strategyAddresses)
                .call();
            return result; // Safe for small uint96 values
        } catch (error) {
            this.logger.error(`Error in getOperatorShares: ${error.message}`);
            throw error;
        }
    }

    async getOperatorSetsForOperator(operatorAddr: string): Promise<OperatorSet[]> {
        try {
            const result: [string, Uint32][] = await this.allocationManager.methods
                .getAllocatedSets(operatorAddr)
                .call();
            return result.map(([avs, id]) => ({ id, avs }));
        } catch (error: any) {
            this.logger.error(`Error in getOperatorSetsForOperator: ${error.message}`);
            throw error;
        }
    }

    async getAllocationDelay(operatorAddr: string | null): Promise<Uint32> {
        try {
            const [isSet, delay]: [boolean, Uint32] = await this.allocationManager.methods
                .getAllocationDelay(operatorAddr)
                .call();
            return isSet ? delay : 0n;
        } catch (error) {
            this.logger.error(`Error in getAllocationDelay: ${error.message}`);
            throw error;
        }
    }

    async getRegisteredSets(operatorAddr: string | null): Promise<OperatorSet[]> {
        try {
            const result: [Uint32, string][] = await this.allocationManager.methods
                .getRegisteredSets(operatorAddr)
                .call();
            return result.map(([id, avs]) => ({ id, avs }));
        } catch (error) {
            this.logger.error(`Error in getRegisteredSets: ${error.message}`);
            throw error;
        }
    }

    async isOperatorRegisteredWithAvs(operatorAddress: string | null, avsAddress: string | null): Promise<boolean> {
        try {
            const status: Uint8 = await this.avsDirectory.methods
                .avsOperatorStatus(avsAddress, operatorAddress)
                .call();
            return status == 1n;
        } catch (error) {
            this.logger.error(`Error in isOperatorSignedWithAvs: ${error.message}`);
            return false;
        }
    }

    async isOperatorRegisteredWithOperatorSet(operatorAddr: string | null, operatorSet: OperatorSet): Promise<boolean> {
        try {
            const sets: OperatorSet[] = await this.getRegisteredSets(operatorAddr);
            return sets.some(({id, avs}) => id == (operatorSet.id || 0n) && avs == operatorSet.avs);
        } catch (error) {
            this.logger.error(`Error in isOperatorSignedWithOperatorSet: ${error.message}`);
            return false;
        }
    }

    async isOperatorSlashable(operatorAddress: string | null, operatorSet: OperatorSet): Promise<boolean> {
        try {
            return await this.allocationManager.methods
                .isOperatorSlashable(operatorAddress, [operatorSet.avs, operatorSet.id])
                .call();
        } catch (error) {
            this.logger.error(`Error in isOperatorSlashable: ${error.message}`);
            return false;
        }
    }

    async getAllocatedStake(
        operatorSet: OperatorSet,
        operatorAddresses: string[],
        strategyAddresses: string[]
    ): Promise<Uint256[][]> {
        try {
            return await this.allocationManager.methods
                .getAllocatedStake(
                    [operatorSet.avs, operatorSet.id],
                    operatorAddresses,
                    strategyAddresses
                )
                .call();
        } catch (error) {
            this.logger.error(`Error in getAllocatedStake: ${error.message}`);
            throw error;
        }
    }

    async getOperatorsForOperatorSet(operatorSet: OperatorSet): Promise<string[]> {
        if (operatorSet.id == 0n) {
            throw new Error('Legacy AVSs not supported');
        }
        if (!this.allocationManager) {
            throw new Error('AllocationManager contract not provided');
        }
        try {
            return await this.allocationManager.methods
            .getMembers([operatorSet.avs, operatorSet.id])
            .call();
        } catch (error) {
            this.logger.error(`Error in getOperatorsForOperatorSet: ${error.message}`);
            throw error;
        }
    }

    async getNumOperatorsForOperatorSet(operatorSet: OperatorSet): Promise<bigint> {
        try {
            const num: Uint256 = await this.allocationManager.methods
                .getMemberCount([operatorSet.avs, operatorSet.id])
                .call();
            return BigInt(num);
        } catch (error) {
            this.logger.error(`Error in getNumOperatorsForOperatorSet: ${error.message}`);
            throw error;
        }
    }

    async getStrategiesForOperatorSet(operatorSet: OperatorSet): Promise<string[]> {
        if (operatorSet.id == 0n) {
            throw new Error('Legacy AVSs not supported');
        }
        if (!this.allocationManager) {
            throw new Error('AllocationManager contract not provided');
        }
        try {
            return await this.allocationManager.methods
                .getStrategiesInOperatorSet([operatorSet.avs, operatorSet.id])
                .call();
        } catch (error) {
            this.logger.error(`Error in getStrategiesForOperatorSet: ${error.message}`);
            throw error;
        }
    }

    async isOperatorRegistered(operatorAddress: string | null): Promise<boolean> {
        try {
            return await this.delegationManager.methods.isOperator(operatorAddress).call();
        } catch (error) {
            this.logger.error(`Error in isOperatorSigned: ${error.message}`);
            return false;
        }
    }

    // async getStakerShares(stakerAddress: string | null): Promise<[string[], number[]]> {
    //     try {
    //         const [addresses, shares]: [string[], string[]] = await this.delegationManager.methods
    //             .getDepositedShares(stakerAddress)
    //             .call();
    //         return [addresses, shares.map(Number)]; // Convert uint96 strings to numbers if safe
    //     } catch (error) {
    //         this.logger.error(`Error in getStakerShares: ${error.message}`);
    //         throw error;
    //     }
    // }

    async getAvsRegistrar(avsAddress: string | null): Promise<string> {
        try {
            return await this.allocationManager.methods.getAVSRegistrar(avsAddress).call();
        } catch (error) {
            this.logger.error(`Error in getAvsRegistrar: ${error.message}`);
            throw error;
        }
    }

    async getDelegatedOperator(stakerAddress: string | null, blockNumber?: BlockNumber): Promise<string> {
        try {
            const callOptions = blockNumber ? { blockIdentifier: blockNumber } : {};
            return await this.delegationManager.methods.delegatedTo(stakerAddress).call(callOptions);
        } catch (error) {
            this.logger.error(`Error in getDelegatedOperator: ${error.message}`);
            throw error;
        }
    }

    // TODO: can be simplified
    async getOperatorDetails(operator: { address: string }): Promise<OperatorDetails> {
        try {
            const addr = this.web3.utils.toChecksumAddress(operator.address);
            const [isSet, delay]: [boolean, number] = await this.allocationManager.methods
                .getAllocationDelay(addr)
                .call();
            const delegationApproverAddress: string = await this.delegationManager.methods
                .delegationApproverSaltIsSpent(addr, '0x' + '00'.repeat(32))
                .call();
            return {
                address: addr,
                delegationApproverAddress,
                allocationDelay: isSet ? delay : 0
            };
        } catch (error) {
            this.logger.error(`Error in getOperatorDetails: ${error.message}`);
            throw error;
        }
    }

    async getOperatorSharesInStrategy(operatorAddr?: string, strategyAddr?: string): Promise<Uint256> {
        try {
            const result: Uint256 = await this.delegationManager.methods
                .operatorShares(operatorAddr, strategyAddr)
                .call();
            return result;
        } catch (error) {
            this.logger.error(`Error in getOperatorSharesInStrategy: ${error.message}`);
            throw error;
        }
    }

    async calculateDelegationApprovalDigestHash(
        staker: string | null,
        operator: string | null,
        delegationApprover: string | null,
        approverSalt: Bytes,
        expiry: Uint256
    ): Promise<string> {
        try {
            return await this.delegationManager.methods
                .calculateDelegationApprovalDigestHash(staker, operator, delegationApprover, approverSalt, expiry)
                .call();
        } catch (error) {
            this.logger.error(`Error in calculateDelegationApprovalDigestHash: ${error.message}`);
            throw error;
        }
    }

    async getOperatorsShares(
        operatorAddresses: string[],
        strategyAddresses: string[]
    ): Promise<Uint256[][]> {
        try {
            return await this.delegationManager.methods
                .getOperatorsShares(operatorAddresses, strategyAddresses)
                .call();
        } catch (error) {
            this.logger.error(`Error in getOperatorsShares: ${error.message}`);
            throw error;
        }
    }

    async getDelegationApproverSaltIsSpent(
        delegationApprover: string,
        approverSalt: Bytes
    ): Promise<boolean> {
        try {
            return await this.delegationManager.methods
                .delegationApproverSaltIsSpent(delegationApprover, approverSalt)
                .call();
        } catch (error) {
            this.logger.error(`Error in getDelegationApproverSaltIsSpent: ${error.message}`);
            return false;
        }
    }

    async getPendingWithdrawalStatus(withdrawalRoot: Bytes): Promise<boolean> {
        try {
            return await this.delegationManager.methods.pendingWithdrawals(withdrawalRoot).call();
        } catch (error) {
            this.logger.error(`Error in getPendingWithdrawalStatus: ${error.message}`);
            return false;
        }
    }

    async getCumulativeWithdrawalsQueued(staker: string | null): Promise<Uint256> {
        try {
            const result: Uint256 = await this.delegationManager.methods
                .cumulativeWithdrawalsQueued(staker)
                .call();
            return result;
        } catch (error) {
            this.logger.error(`Error in getCumulativeWithdrawalsQueued: ${error.message}`);
            throw error;
        }
    }

    async canCall(
        accountAddress: string | null,
        appointeeAddress: string | null,
        target: string | null,
        selector: Bytes
    ): Promise<boolean> {
        try {
            return await this.permissionController.methods
                .canCall(accountAddress, appointeeAddress, target, selector)
                .call();
        } catch (error) {
            this.logger.error(`Error in canCall: ${error.message}`);
            return false;
        }
    }

    async listAppointees(
        accountAddress: string | null,
        target: string | null,
        selector: Bytes
    ): Promise<string[]> {
        try {
            return await this.permissionController.methods
                .getAppointees(accountAddress, target, selector)
                .call();
        } catch (error) {
            this.logger.error(`Error in listAppointees: ${error.message}`);
            throw error;
        }
    }

    async listAppointeePermissions(
        accountAddress: string | null,
        appointeeAddress: string | null
    ): Promise<[string[], string[]]> {
        try {
            return await this.permissionController.methods
                .getAppointeePermissions(accountAddress, appointeeAddress)
                .call();
        } catch (error) {
            this.logger.error(`Error in listAppointeePermissions: ${error.message}`);
            throw error;
        }
    }

    async listPendingAdmins(accountAddress: string | null): Promise<string[]> {
        try {
            return await this.permissionController.methods.getPendingAdmins(accountAddress).call();
        } catch (error) {
            this.logger.error(`Error in listPendingAdmins: ${error.message}`);
            throw error;
        }
    }

    async listAdmins(accountAddress: string | null): Promise<string[]> {
        try {
            return await this.permissionController.methods.getAdmins(accountAddress).call();
        } catch (error) {
            this.logger.error(`Error in listAdmins: ${error.message}`);
            throw error;
        }
    }

    async isPendingAdmin(
        accountAddress: string | null,
        pendingAdminAddress: string | null
    ): Promise<boolean> {
        try {
            return await this.permissionController.methods
                .isPendingAdmin(accountAddress, pendingAdminAddress)
                .call();
        } catch (error) {
            this.logger.error(`Error in isPendingAdmin: ${error.message}`);
            return false;
        }
    }

    async isAdmin(accountAddress: string | null, adminAddress: string | null): Promise<boolean> {
        try {
            return await this.permissionController.methods
                .isAdmin(accountAddress, adminAddress)
                .call();
        } catch (error) {
            this.logger.error(`Error in isAdmin: ${error.message}`);
            return false;
        }
    }

    async getDistributionRootsLength(): Promise<Uint256> {
        try {
            return await this.rewardCoordinator.methods.getDistributionRootsLength().call();
        } catch (error) {
            this.logger.error(`Error in getDistributionRootsLength: ${error.message}`);
            throw error;
        }
    }

    async currRewardsCalculationEndTimestamp(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods
                .currRewardsCalculationEndTimestamp()
                .call();
        } catch (error) {
            this.logger.error(`Error in currRewardsCalculationEndTimestamp: ${error.message}`);
            throw error;
        }
    }

    // TODO: Python not matched
    async getCurrentClaimableDistributionRoot(): Promise<DistributionRoot> {
        try {
            const [root, rewardsCalculationEndTimestamp, activatedAt, disabled]: [Bytes, BlockNumber, BlockNumber, boolean] =
                await this.rewardCoordinator.methods
                    .getCurrentClaimableDistributionRoot()
                    .call();
            return { root, rewardsCalculationEndTimestamp, activatedAt, disabled };
        } catch (error) {
            this.logger.error(`Error in getCurrentClaimableDistributionRoot: ${error.message}`);
            throw error;
        }
    }

    async getRootIndexFromHash(rootHash: string): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.getRootIndexFromHash(rootHash).call();
        } catch (error) {
            this.logger.error(`Error in getRootIndexFromHash: ${error.message}`);
            throw error;
        }
    }

    async getCumulativeClaimed(earner?: string, token?: string): Promise<Uint256> {
        try {
            return await this.rewardCoordinator.methods
                .cumulativeClaimed(earner, token)
                .call();
        } catch (error) {
            this.logger.error(`Error in getCumulativeClaimed: ${error.message}`);
            throw error;
        }
    }

    async checkClaim(claim: ClaimCheckParams): Promise<boolean> {
        try {
            const tokenIndices = claim.tokenIndices || [];
            const tokenTreeProofs = claim.tokenTreeProofs || [];
            const tokenLeaves = claim.tokenLeaves || [];
            if (
                tokenIndices.length !== tokenTreeProofs.length ||
                tokenTreeProofs.length !== tokenLeaves.length
            ) {
                throw new Error('tokenIndices, tokenTreeProofs, and tokenLeaves must have the same length');
            }
            const distributionRootsLength: Uint256 = await this.getDistributionRootsLength();
            if (distributionRootsLength == 0n) {
                throw new Error('No distribution roots exist in the contract yet');
            }
            const rootIndex: Uint32 = claim.rootIndex || 0n;
            if (rootIndex < 0n || rootIndex >= distributionRootsLength) {
                throw new Error(
                    `rootIndex ${rootIndex} is out of bounds. Must be between 0 and ${distributionRootsLength - 1n}`
                );
            }
            const earnerLeaf = claim.earnerLeaf || { earner: '', earnerTokenRoot: '' };
            if (!earnerLeaf.earner || !this.web3.utils.isAddress(earnerLeaf.earner)) {
                throw new Error('Invalid earner address in earnerLeaf');
            }
            if (!earnerLeaf.earnerTokenRoot || earnerLeaf.earnerTokenRoot.length !== 66) {
                // 32 bytes as hex (0x + 64 chars)
                throw new Error('earnerTokenRoot must be 32 bytes');
            }
            const earnerLeafTuple: [string, string] = [
                earnerLeaf.earner,
                earnerLeaf.earnerTokenRoot
            ];
            const tokenLeavesTuples: [string, Uint256][] = tokenLeaves.map((leaf, i) => {
                if (!leaf.token || !this.web3.utils.isAddress(leaf.token)) {
                    throw new Error(`Invalid token address in tokenLeaves[${i}]`);
                }
                if (!Number.isInteger(leaf.cumulativeEarnings)) {
                    throw new Error(`cumulativeEarnings must be an integer in tokenLeaves[${i}]`);
                }
                return [
                    leaf.token,
                    leaf.cumulativeEarnings
                ];
            });
            const claimTuple: [Uint32, Uint32, Bytes, [string, Bytes], Uint32[], Bytes[], [string, Uint256][]] = [
                rootIndex,
                claim.earnerIndex || 0n,
                claim.earnerTreeProof || '0x',
                earnerLeafTuple,
                tokenIndices,
                tokenTreeProofs,
                tokenLeavesTuples
            ];
            return await this.rewardCoordinator.methods.checkClaim(claimTuple).call();
        } catch (error) {
            this.logger.error(`Error in checkClaim: ${error.message}`);
            throw error;
        }
    }

    async getOperatorAvsSplit(operator: string | null, avs: string | null): Promise<Uint16> {
        try {
            return await this.rewardCoordinator.methods
                .getOperatorAVSSplit(operator, avs)
                .call();
        } catch (error) {
            this.logger.error(`Error in getOperatorAvsSplit: ${error.message}`);
            throw error;
        }
    }

    async getOperatorPiSplit(operator: string): Promise<Uint16> {
        try {
            return await this.rewardCoordinator.methods
                .getOperatorPISplit(operator)
                .call();
        } catch (error) {
            this.logger.error(`Error in getOperatorPiSplit: ${error.message}`);
            throw error;
        }
    }

    async getOperatorSetSplit(operator: string, operatorSet: OperatorSet): Promise<Uint16> {
        try {
            return await this.rewardCoordinator.methods
                .getOperatorSetSplit(operator, [operatorSet.avs, operatorSet.id])
                .call();
        } catch (error) {
            this.logger.error(`Error in getOperatorSetSplit: ${error.message}`);
            throw error;
        }
    }

    async getCurrRewardsCalculationEndTimestamp(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods
                .currRewardsCalculationEndTimestamp()
                .call();
        } catch (error) {
            this.logger.error(`Error in getCurrRewardsCalculationEndTimestamp: ${error.message}`);
            throw error;
        }
    }

    async getRewardsUpdater(): Promise<string> {
        try {
            return await this.rewardCoordinator.methods.rewardsUpdater().call();
        } catch (error) {
            this.logger.error(`Error in getRewardsUpdater: ${error.message}`);
            throw error;
        }
    }

    async getDefaultOperatorSplitBips(): Promise<Uint16> {
        try {
            return await this.rewardCoordinator.methods
                .defaultOperatorSplitBips()
                .call();
        } catch (error) {
            this.logger.error(`Error in getDefaultOperatorSplitBips: ${error.message}`);
            throw error;
        }
    }

    async getClaimerFor(earner: string): Promise<string> {
        try {
            return await this.rewardCoordinator.methods.claimerFor(earner).call();
        } catch (error) {
            this.logger.error(`Error in getClaimerFor: ${error.message}`);
            throw error;
        }
    }

    async getSubmissionNonce(avs: string): Promise<Uint256> {
        try {
            return await this.rewardCoordinator.methods.submissionNonce(avs).call();
        } catch (error) {
            this.logger.error(`Error in getSubmissionNonce: ${error.message}`);
            throw error;
        }
    }

    async getIsAvsRewardsSubmissionHash(avs: string, hash: Bytes): Promise<boolean> {
        try {
            return await this.rewardCoordinator.methods
                .isAVSRewardsSubmissionHash(avs, hash)
                .call();
        } catch (error) {
            this.logger.error(`Error in getIsAvsRewardsSubmissionHash: ${error.message}`);
            return false;
        }
    }

    async getIsRewardsSubmissionForAllHash(avs: string, hash: Bytes): Promise<boolean> {
        try {
            return await this.rewardCoordinator.methods
                .isRewardsSubmissionForAllHash(avs, hash)
                .call();
        } catch (error) {
            this.logger.error(`Error in getIsRewardsSubmissionForAllHash: ${error.message}`);
            return false;
        }
    }

    async getIsRewardsForAllSubmitter(submitter: string): Promise<boolean> {
        try {
            return await this.rewardCoordinator.methods
                .isRewardsForAllSubmitter(submitter)
                .call();
        } catch (error) {
            this.logger.error(`Error in getIsRewardsForAllSubmitter: ${error.message}`);
            return false;
        }
    }

    async getIsRewardsSubmissionForAllEarnersHash(avs: string, hash: Bytes): Promise<boolean> {
        try {
            return await this.rewardCoordinator.methods
                .isRewardsSubmissionForAllEarnersHash(avs, hash)
                .call();
        } catch (error) {
            this.logger.error(`Error in getIsRewardsSubmissionForAllEarnersHash: ${error.message}`);
            return false;
        }
    }

    async getIsOperatorDirectedAvsRewardsSubmissionHash(avs: string, hash: Bytes): Promise<boolean> {
        try {
            return await this.rewardCoordinator.methods
                .isOperatorDirectedAVSRewardsSubmissionHash(avs, hash)
                .call();
        } catch (error) {
            this.logger.error(`Error in getIsOperatorDirectedAvsRewardsSubmissionHash: ${error.message}`);
            return false;
        }
    }

    async getIsOperatorDirectedOperatorSetRewardsSubmissionHash(avs: string, hash: Bytes): Promise<boolean> {
        try {
            return await this.rewardCoordinator.methods
                .isOperatorDirectedOperatorSetRewardsSubmissionHash(avs, hash)
                .call();
        } catch (error) {
            this.logger.error(`Error in getIsOperatorDirectedOperatorSetRewardsSubmissionHash: ${error.message}`);
            return false;
        }
    }

    async getStrategyAndUnderlyingToken(strategyAddr: string): Promise<[Contract<any>, string]> {
        try {
            // @ts-ignore
            const sc = new this.web3.eth.Contract(this.strategyAbi, strategyAddr);
            const underlyingToken: string = await sc.methods.underlyingToken().call();
            return [sc, underlyingToken];
        } catch (error) {
            this.logger.error(`Error in getStrategyAndUnderlyingToken: ${error.message}`);
            throw error;
        }
    }

    async getStrategyAndUnderlyingErc20Token(
        strategyAddr: string
    ): Promise<[Contract<any>, Contract<any>, string]> {
        try {
            // @ts-ignore
            const strategyContract = new this.web3.eth.Contract(this.strategyAbi, strategyAddr);
            const tokenAddr: string = this.web3.utils.toChecksumAddress(
                await strategyContract.methods.underlyingToken().call()
            );
            // @ts-ignore
            const erc20Contract = new this.web3.eth.Contract(this.erc20Abi, tokenAddr);
            return [strategyContract, erc20Contract, tokenAddr];
        } catch (error) {
            this.logger.error(`Error in getStrategyAndUnderlyingErc20Token: ${error.message}`);
            throw error;
        }
    }

    async calculateOperatorAvsRegistrationDigestHash(operator: string, avs: string, salt: Bytes, expiry: Uint256): Promise<Bytes> {
        try {
            return await this.avsDirectory.methods
                .calculateOperatorAVSRegistrationDigestHash(operator, avs, salt, expiry)
                .call();
        } catch (error) {
            this.logger.error(`Error in calculateOperatorAvsRegistrationDigestHash: ${error.message}`);
            throw error;
        }
    }

    async getEncumberedMagnitude(operatorAddress: string, strategyAddress: string): Promise<Uint64> {
        try {
            return await this.allocationManager.methods
                .getEncumberedMagnitude(operatorAddress, strategyAddress)
                .call();
        } catch (error) {
            this.logger.error(`Error in getEncumberedMagnitude: ${error.message}`);
            throw error;
        }
    }

    async getCalculationIntervalSeconds(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.CALCULATION_INTERVAL_SECONDS().call();
        } catch (error) {
            this.logger.error(`Error in getCalculationIntervalSeconds: ${error.message}`);
            throw error;
        }
    }

    async getMaxRewardsDuration(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.MAX_REWARDS_DURATION().call();
        } catch (error) {
            this.logger.error(`Error in getMaxRewardsDuration: ${error.message}`);
            throw error;
        }
    }

    async getMaxRetroactiveLength(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.MAX_RETROACTIVE_LENGTH().call();
        } catch (error) {
            this.logger.error(`Error in getMaxRetroactiveLength: ${error.message}`);
            throw error;
        }
    }

    async getMaxFutureLength(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.MAX_FUTURE_LENGTH().call();
        } catch (error) {
            this.logger.error(`Error in getMaxFutureLength: ${error.message}`);
            throw error;
        }
    }

    async getGenesisRewardsTimestamp(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.GENESIS_REWARDS_TIMESTAMP().call();
        } catch (error) {
            this.logger.error(`Error in getGenesisRewardsTimestamp: ${error.message}`);
            throw error;
        }
    }

    async getActivationDelay(): Promise<Uint32> {
        try {
            return await this.rewardCoordinator.methods.activationDelay().call();
        } catch (error) {
            this.logger.error(`Error in getActivationDelay: ${error.message}`);
            throw error;
        }
    }

    async getDeallocationDelay(): Promise<Uint32> {
        try {
            return await this.allocationManager.methods.DEALLOCATION_DELAY().call();
        } catch (error) {
            this.logger.error(`Error in getDeallocationDelay: ${error.message}`);
            throw error;
        }
    }

    async getAllocationConfigurationDelay(): Promise<Uint32> {
        try {
            return await this.allocationManager.methods.ALLOCATION_CONFIGURATION_DELAY().call();
        } catch (error) {
            this.logger.error(`Error in getAllocationConfigurationDelay: ${error.message}`);
            throw error;
        }
    }

    async getNumOperatorSetsForOperator(operatorAddress: string): Promise<number> {
        try {
            const result: [string, Uint32][] = await this.allocationManager.methods
                .getAllocatedSets(operatorAddress)
                .call();
            return result.length;
        } catch (error) {
            this.logger.error(`Error in getNumOperatorSetsForOperator: ${error.message}`);
            throw error;
        }
    }

    async getSlashableShares(operatorAddress: string, operatorSet: OperatorSet, strategies: string[]): Promise<{ [key: string]: Uint256 } | null> {
        if (!operatorAddress) {
            return null;
        }
        try {
            const result: Uint256[][] = await this.allocationManager.methods
                .getMinimumSlashableStake(
                    [operatorSet.avs, operatorSet.id],
                    [operatorAddress],
                    strategies,
                    await this.web3.eth.getBlockNumber()
                )
                .call();
            const stakes: { [key: string]: Uint256 } = {};
            result[0].forEach((stake, index) => {
                stakes[strategies[index]] = stake; // Safe for small uint96 values
            });
            return stakes;
        } catch (error) {
            this.logger.error(`Error in getSlashableShares: ${error.message}`);
            throw error;
        }
    }

    async getSlashableSharesForOperatorSetsBefore(operatorSets: OperatorSet[], futureBlock: BlockNumber): Promise<SlashableStake[]> {
        try {
            const result: SlashableStake[] = [];
            for (const opSet of operatorSets) {
                const operators = await this.getOperatorsForOperatorSet(opSet);
                const strategies = await this.getStrategiesForOperatorSet(opSet);
                const stakes: Uint256[][] = await this.allocationManager.methods
                    .getMinimumSlashableStake(
                        [this.web3.utils.toChecksumAddress(opSet.avs), opSet.id],
                        operators,
                        strategies,
                        futureBlock
                    )
                    .call();
                result.push({
                    operatorSet: opSet,
                    strategies,
                    operators,
                    slashableStakes: stakes
                });
            }
            return result;
        } catch (error) {
            this.logger.error(`Error in getSlashableSharesForOperatorSetsBefore: ${error.message}`);
            throw error;
        }
    }

    async getSlashableSharesForOperatorSets(operatorSets: OperatorSet[]): Promise<SlashableStake[] | null> {
        try {
            return await this.getSlashableSharesForOperatorSetsBefore(
                operatorSets,
                await this.web3.eth.getBlockNumber()
            );
        } catch (error) {
            this.logger.error(`Error in getSlashableSharesForOperatorSets: ${error.message}`);
            throw error;
        }
    }
}
