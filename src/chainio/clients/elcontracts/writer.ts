import { Logger } from 'pino'
import {
    Contract,
    Web3,
    Address,
    TransactionReceipt
} from "web3";
import { AbiItem } from "web3-utils"
// import {TxReceipt, LocalAccount } from "web3";
import * as chainIoUtils from '../../utils'
import * as ABIs from '../../../contracts/ABIs'
import { sendContractCall } from "../../utils";
import { ClaimCheckParams, ELReader } from './reader';
import { Bytes, LocalAccount, Operator, Uint16, Uint256, Uint32, Uint64 } from '../../../types/general';
import { KeyPair } from '../../../crypto/bls/attestation';


export enum RegistrationType {
    NORMAL = 0,
    TRUSTED = 1,
}

interface AdminRequest {
    accountAddress: string;
    adminAddress?: string;
}

export class ELWriter {
    transactor: chainIoUtils.Transactor;

    constructor(
        private readonly allocationManager: Contract<typeof ABIs.ALLOCATION_MANAGER_ABI>,
        private readonly avsDirectory: Contract<typeof ABIs.AVS_DIRECTORY_ABI>,
        private readonly delegationManager: Contract<typeof ABIs.DELEGATION_MANAGER_ABI>,
        private readonly permissionController: Contract<typeof ABIs.PERMISSION_CONTROLLER_ABI>,
        private readonly rewardsCoordinator: Contract<typeof ABIs.REWARDS_COORDINATOR_ABI>,
        private readonly registryCoordinator: Contract<typeof ABIs.REGISTRY_COORDINATOR_ABI>,
        private readonly strategyManager: Contract<typeof ABIs.STRATEGY_MANAGER_ABI>,
        private readonly elChainReader: ELReader,
        private readonly ethHttpClient: Web3,
        private readonly logger: Logger,
        private readonly pkWallet: LocalAccount,
        private readonly strategyAbi: AbiItem[],
        private readonly erc20Abi: AbiItem[]
    ) {
        this.transactor = new chainIoUtils.Transactor(pkWallet, ethHttpClient);
    }

    async sendTransaction(contract: Contract<any>, method: string, params: any[]): Promise<TransactionReceipt> {
        return this.transactor.send(contract, method, params)
    }

    async registerAsOperator(operator: Operator): Promise<TransactionReceipt> {
        if (!this.delegationManager)
            throw new Error('DelegationManager contract not provided');
        this.logger.info(`Registering operator ${operator.address} to EigenLayer`);
        return await this.sendTransaction(
            this.delegationManager,
            'registerAsOperator',
            [
                operator.delegationApproverAddress,
                operator.allocationDelay,
                operator.metadataUrl,
            ]
        );
    }

    async updateOperatorDetails(operator: Operator): Promise<TransactionReceipt> {
        if (!this.delegationManager) 
            throw new Error('DelegationManager contract not provided');
        this.logger.info(`Updating operator details of operator ${operator.address} to EigenLayer`);
        return await this.sendTransaction(
            this.delegationManager, 
            'modifyOperatorDetails', 
            [
                operator.address,
                operator.delegationApproverAddress,
            ]
        );
    }

    async updateMetadataUri(operatorAddress: string, uri: string): Promise<TransactionReceipt> {
        if (!this.delegationManager) 
            throw new Error('DelegationManager contract not provided');
        return await this.sendTransaction(
            this.delegationManager, 
            'updateOperatorMetadataURI', 
            [operatorAddress, uri]
        );
    }

    async depositErc20IntoStrategy(strategyAddr: string, amount: Uint256): Promise<TransactionReceipt> {
        if (!this.elChainReader || !this.strategyManager) 
            throw new Error('Required contracts not provided');
        this.logger.info(`Depositing ${amount} tokens into strategy ${strategyAddr}`);
        const [, tokenContract, tokenAddr] = await this.elChainReader.getStrategyAndUnderlyingErc20Token(strategyAddr);
        await this.sendTransaction(
            tokenContract, 
            'approve', 
            [this.strategyManager.options.address, amount]
        );
        return await this.sendTransaction(
            this.strategyManager, 
            'depositIntoStrategy', 
            [strategyAddr, tokenAddr, amount]
        );
    }

    async setClaimerFor(claimer: string): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator) 
            throw new Error('RewardsCoordinator contract not provided');
        return await this.sendTransaction(
            this.rewardsCoordinator, 
            'setClaimerFor', 
            [claimer]
        );
    }

    async processClaim(claim: ClaimCheckParams, recipientAddress: string): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator) 
            throw new Error('RewardsCoordinator contract not provided');
        const claimTuple: [
            Uint32,
            Uint32,
            Bytes,
            [string, Bytes],
            Uint32[],
            Bytes[],
            [string, Uint256][]
        ] = [
                claim.rootIndex,
                claim.earnerIndex,
                claim.earnerTreeProof,
                [
                    claim.earnerLeaf.earner,
                    claim.earnerLeaf.earnerTokenRoot,
                ],
                claim.tokenIndices,
                claim.tokenTreeProofs,
                claim.tokenLeaves.map(tl => [
                    tl.token,
                    tl.cumulativeEarnings,
                ]),
            ];
        return await this.sendTransaction(
            this.rewardsCoordinator, 
            'processClaim', 
            [claimTuple, recipientAddress]
        );
    }

    async setOperatorAvsSplit(operator: string, avs: string, split: Uint16): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator) 
            throw new Error('RewardsCoordinator contract not provided');
        return await this.sendTransaction(
            this.rewardsCoordinator, 
            'setOperatorAVSSplit', 
            [operator,avs,split]
        );
    }

    async setOperatorPiSplit(operator: string, split: Uint16): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator) 
            throw new Error('RewardsCoordinator contract not provided');
        return await this.sendTransaction(
            this.rewardsCoordinator, 
            'setOperatorPISplit', 
            [operator,split]
        );
    }

    async modifyAllocations(
        operatorAddress: string,
        avsServiceManager: string,
        operatorSetId: Uint32,
        strategies: string[],
        newMagnitudes: Uint64[]
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager) 
            throw new Error('AllocationManager contract not provided');
        const allocation: [[string, Uint32], string[], Uint64[]] = [
            [avsServiceManager, operatorSetId],
            strategies,
            newMagnitudes,
        ];
        return await this.sendTransaction(
            this.allocationManager, 
            'modifyAllocations', 
            [operatorAddress, [allocation]]
        );
    }

    async clearDeallocationQueue(operatorAddress: string, strategies: string[], numsToClear: Uint16[]): Promise<TransactionReceipt> {
        if (!this.allocationManager) 
            throw new Error('AllocationManager contract not provided');
        return await this.sendTransaction(
            this.allocationManager, 
            'clearDeallocationQueue', 
            [operatorAddress, strategies, numsToClear]
        );
    }

    async setAllocationDelay(operatorAddress: string, delay: Uint32): Promise<TransactionReceipt> {
        if (!this.allocationManager) 
            throw new Error('AllocationManager contract not provided');
        return await this.sendTransaction(
            this.allocationManager, 
            'setAllocationDelay', 
            [operatorAddress, delay]
        );
    }

    async deregisterFromOperatorSets(
        operator: string, 
        request: {avs: string, operatorSetIds: Uint32[]}
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager) 
            throw new Error('AllocationManager contract not provided');
        return await this.sendTransaction(
            this.allocationManager, 
            'deregisterFromOperatorSets', [
            {
                operator: operator,
                avs: request.avs,
                operatorSetIds: request.operatorSetIds,
            },
        ]);
    }

    async registerForOperatorSets(
        registryCoordinatorAddr: string, 
        request: {
            operatorAddress: string,
            blsKeyPair: KeyPair,
            socket: string,
            avsAddress: string,
            operatorSetIds: Uint32[]
        }
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager) throw new Error('AllocationManager contract not provided');
        const pubkeyRegParams = await chainIoUtils.getPubkeyRegistrationParams(
            this.ethHttpClient,
            registryCoordinatorAddr,
            request.operatorAddress,
            request.blsKeyPair
        );
        const encodedData = chainIoUtils.abiEncodeNormalRegistrationParams(
            RegistrationType.NORMAL,
            request.socket,
            pubkeyRegParams
        );
        return await this.sendTransaction(
            this.allocationManager, 
            'registerForOperatorSets', 
            [
                request.operatorAddress,
                {
                    avs: request.avsAddress,
                    operatorSetIds: request.operatorSetIds,
                    data: encodedData,
                }
            ]
        );
    }

    async removePermission(
        request: {
            accountAddress: string,
            appointeeAddress: string,
            target: string,
            selector: Bytes,
        }
    ): Promise<TransactionReceipt> {
        if (!this.permissionController) 
            throw new Error('PermissionController contract not provided');
        return await this.sendTransaction(
            this.permissionController, 
            'removeAppointee', 
            [
                request.accountAddress,
                request.appointeeAddress,
                request.target,
                request.selector,
            ]
        );
    }

    async setPermission(
        request: {
            accountAddress: string,
            appointeeAddress: string,
            target: string,
            selector: Bytes,
        }
    ): Promise<TransactionReceipt> {
        if (!this.permissionController) 
            throw new Error('PermissionController contract not provided');
        return await this.sendTransaction(
            this.permissionController, 
            'setAppointee', 
            [
                request.accountAddress,
                request.appointeeAddress,
                request.target,
                request.selector,
            ]
        );
    }

    async acceptAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController) 
            throw new Error('PermissionController contract not provided');
        return await this.sendTransaction(this.permissionController, 'acceptAdmin', [
            request.accountAddress,
        ]);
    }

    async addPendingAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController) 
            throw new Error('PermissionController contract not provided');
        return await this.sendTransaction(this.permissionController, 'addPendingAdmin', [
            request.accountAddress,
            request.adminAddress,
        ]);
    }

    async removeAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController) 
            throw new Error('PermissionController contract not provided');
        return await this.sendTransaction(this.permissionController, 'removeAdmin', [
            request.accountAddress,
            request.adminAddress,
        ]);
    }

    async removePendingAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController) 
            throw new Error('PermissionController contract not provided');
        return await this.sendTransaction(this.permissionController, 'removePendingAdmin', [
            request.accountAddress,
            request.adminAddress,
        ]);
    }

    async getOperatorId(operatorAddress: string): Promise<Bytes> {
        if (!this.registryCoordinator) 
            throw new Error('RegistryCoordinator contract not provided');
        return await this.registryCoordinator.methods.getOperatorId(
            operatorAddress
        ).call();
    }

    async setAvsRegistrar(avsAddress: string, registrarAddress: string): Promise<TransactionReceipt> {
        if (!this.allocationManager) 
            throw new Error('AllocationManager contract not provided');
        return await this.sendTransaction(this.allocationManager, 'setAVSRegistrar', [
            avsAddress,
            registrarAddress,
        ]);
    }
}
