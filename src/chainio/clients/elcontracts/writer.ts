import { Logger } from "pino";
import { Contract, Web3, Address, TransactionReceipt } from "web3";
import { AbiItem } from "web3-utils";
// import {TxReceipt, LocalAccount } from "web3";
import * as chainIoUtils from "../../utils";
import * as ABIs from "../../../contracts/ABIs";
import { sendContractCall } from "../../utils";
import { ClaimCheckParams, ELReader } from "./reader";
import {
    Bytes,
    LocalAccount,
    Operator,
    Uint16,
    Uint256,
    Uint32,
    Uint64,
} from "../../../types/general";
import { KeyPair } from "../../../crypto/bls/attestation";
import { obj2arr } from "../../../utils/helpers.js";
import { RegistrationRequest, SignatureWithSaltAndExpiry } from "./types.js";

export enum RegistrationType {
    NORMAL = 0,
    TRUSTED = 1,
}

interface AdminRequest {
    accountAddress: string;
    adminAddress?: string;
}

export class ELWriter {
    constructor(
        public readonly allocationManager: Contract<
            typeof ABIs.ALLOCATION_MANAGER_ABI
        >,
        public readonly avsDirectory: Contract<typeof ABIs.AVS_DIRECTORY_ABI>,
        public readonly delegationManager: Contract<
            typeof ABIs.DELEGATION_MANAGER_ABI
        >,
        public readonly permissionController: Contract<
            typeof ABIs.PERMISSION_CONTROLLER_ABI
        >,
        public readonly rewardsCoordinator: Contract<
            typeof ABIs.REWARDS_COORDINATOR_ABI
        >,
        public readonly registryCoordinator: Contract<
            typeof ABIs.REGISTRY_COORDINATOR_ABI
        >,
        public readonly strategyManager: Contract<
            typeof ABIs.STRATEGY_MANAGER_ABI
        >,
        public readonly elChainReader: ELReader,
        public readonly ethHttpClient: Web3,
        public readonly logger: Logger,
        public readonly pkWallet: LocalAccount,
        public readonly strategyAbi: AbiItem[],
        public readonly erc20Abi: AbiItem[],
    ) {}

    async registerAsOperator(operator: Operator): Promise<TransactionReceipt> {
        if (!this.delegationManager)
            throw new Error("DelegationManager contract not provided");
        this.logger.info(
            `Registering operator ${operator.address} to EigenLayer`,
        );

        return await sendContractCall({
            contract: this.delegationManager,
            method: "registerAsOperator",
            params: [
                operator.delegationApproverAddress,
                operator.allocationDelay,
                operator.metadataUrl,
            ],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.DELEGATION_MANAGER_ABI,
        });
    }

    async updateOperatorDetails(
        operator: Operator,
    ): Promise<TransactionReceipt> {
        if (!this.delegationManager)
            throw new Error("DelegationManager contract not provided");
        this.logger.info(
            `Updating operator details of operator ${operator.address} to EigenLayer`,
        );

        return await sendContractCall({
            contract: this.delegationManager,
            method: "modifyOperatorDetails",
            params: [operator.address, operator.delegationApproverAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.DELEGATION_MANAGER_ABI,
        });
    }

    async updateMetadataUri(
        operatorAddress: string,
        uri: string,
    ): Promise<TransactionReceipt> {
        if (!this.delegationManager)
            throw new Error("DelegationManager contract not provided");

        return await sendContractCall({
            contract: this.delegationManager,
            method: "updateOperatorMetadataURI",
            params: [operatorAddress, uri],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.DELEGATION_MANAGER_ABI,
        });
    }

    async depositErc20IntoStrategy(
        strategyAddr: string,
        amount: Uint256,
    ): Promise<TransactionReceipt> {
        if (!this.elChainReader || !this.strategyManager)
            throw new Error("Required contracts not provided");
        this.logger.info(
            `Depositing ${amount} tokens into strategy ${strategyAddr}`,
        );
        const [, tokenContract, tokenAddr] = obj2arr(
            await this.elChainReader.getStrategyAndUnderlyingErc20Token(
                strategyAddr,
            ),
        );

        await sendContractCall({
            contract: tokenContract,
            method: "approve",
            params: [this.strategyManager.options.address, amount],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.IERC20_ABI,
        });

        return await sendContractCall({
            contract: this.strategyManager,
            method: "depositIntoStrategy",
            params: [strategyAddr, tokenAddr, amount],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.STRATEGY_MANAGER_ABI,
        });
    }

    async setClaimerFor(claimer: string): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator)
            throw new Error("RewardsCoordinator contract not provided");

        return await sendContractCall({
            contract: this.rewardsCoordinator,
            method: "setClaimerFor",
            params: [claimer],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.REWARDS_COORDINATOR_ABI,
        });
    }

    async processClaim(
        claim: ClaimCheckParams,
        recipientAddress: string,
    ): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator)
            throw new Error("RewardsCoordinator contract not provided");
        const claimTuple: [
            Uint32,
            Uint32,
            Bytes,
            [string, Bytes],
            Uint32[],
            Bytes[],
            [string, Uint256][],
        ] = [
            claim.rootIndex,
            claim.earnerIndex,
            claim.earnerTreeProof,
            [claim.earnerLeaf.earner, claim.earnerLeaf.earnerTokenRoot],
            claim.tokenIndices,
            claim.tokenTreeProofs,
            claim.tokenLeaves.map((tl) => [tl.token, tl.cumulativeEarnings]),
        ];

        return await sendContractCall({
            contract: this.rewardsCoordinator,
            method: "processClaim",
            params: [claimTuple, recipientAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.REWARDS_COORDINATOR_ABI,
        });
    }

    async setOperatorAvsSplit(
        operator: string,
        avs: string,
        split: Uint16,
    ): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator)
            throw new Error("RewardsCoordinator contract not provided");

        return await sendContractCall({
            contract: this.rewardsCoordinator,
            method: "setOperatorAVSSplit",
            params: [operator, avs, split],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.REWARDS_COORDINATOR_ABI,
        });
    }

    async setOperatorPiSplit(
        operator: string,
        split: Uint16,
    ): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator)
            throw new Error("RewardsCoordinator contract not provided");

        return await sendContractCall({
            contract: this.rewardsCoordinator,
            method: "setOperatorPISplit",
            params: [operator, split],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.REWARDS_COORDINATOR_ABI,
        });
    }

    async processClaims(
        claims: ClaimCheckParams[],
        recipientAddress: string,
    ): Promise<TransactionReceipt> {
        if (!this.rewardsCoordinator)
            throw new Error("RewardsCoordinator contract not provided");
        const claimsTuple: [
            Uint32,
            Uint32,
            Bytes,
            [string, Bytes],
            Uint32[],
            Bytes[],
            [string, Uint256][],
        ][] = claims.map((claim) => [
            claim.rootIndex,
            claim.earnerIndex,
            claim.earnerTreeProof,
            [claim.earnerLeaf.earner, claim.earnerLeaf.earnerTokenRoot],
            claim.tokenIndices,
            claim.tokenTreeProofs,
            claim.tokenLeaves.map((tl) => [tl.token, tl.cumulativeEarnings]),
        ]);

        return await sendContractCall({
            contract: this.rewardsCoordinator,
            method: "processClaims",
            params: [claimsTuple, recipientAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.REWARDS_COORDINATOR_ABI,
        });
    }

    async modifyAllocations(
        operatorAddress: string,
        avsServiceManager: string,
        operatorSetId: Uint32,
        strategies: string[],
        newMagnitudes: Uint64[],
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager)
            throw new Error("AllocationManager contract not provided");
        const allocation: [[string, Uint32], string[], Uint64[]] = [
            [avsServiceManager, operatorSetId],
            strategies,
            newMagnitudes,
        ];

        return await sendContractCall({
            contract: this.allocationManager,
            method: "modifyAllocations",
            params: [operatorAddress, [allocation]],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.ALLOCATION_MANAGER_ABI,
        });
    }

    async clearDeallocationQueue(
        operatorAddress: string,
        strategies: string[],
        numsToClear: Uint16[],
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager)
            throw new Error("AllocationManager contract not provided");

        return await sendContractCall({
            contract: this.allocationManager,
            method: "clearDeallocationQueue",
            params: [operatorAddress, strategies, numsToClear],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.ALLOCATION_MANAGER_ABI,
        });
    }

    async setAllocationDelay(
        operatorAddress: string,
        delay: Uint32,
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager)
            throw new Error("AllocationManager contract not provided");
        return await sendContractCall({
            contract: this.allocationManager,
            method: "setAllocationDelay",
            params: [operatorAddress, delay],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.ALLOCATION_MANAGER_ABI,
        });
    }

    async deregisterFromOperatorSets(
        operator: string,
        request: { avs: string; operatorSetIds: Uint32[] },
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager)
            throw new Error("AllocationManager contract not provided");

        return await sendContractCall({
            contract: this.allocationManager,
            method: "deregisterFromOperatorSets",
            params: [
                {
                    operator: operator,
                    avs: request.avs,
                    operatorSetIds: request.operatorSetIds,
                },
            ],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.ALLOCATION_MANAGER_ABI,
        });
    }

    async registerForOperatorSets(
        registryCoordinatorAddr: string,
        request: RegistrationRequest,
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager)
            throw new Error("AllocationManager contract not provided");

        const pubkeyRegParams = await chainIoUtils.getPubkeyRegistrationParams(
            this.ethHttpClient,
            registryCoordinatorAddr,
            request.operatorAddress,
            request.blsKeyPair,
        );

        let data;

        if (!!request.churnApprovalEcdsaPrivateKey) {
            const signatureWithSaltAndExpiry =
                await chainIoUtils.signChurnRegistration(
                    this.ethHttpClient,
                    this.registryCoordinator,
                    request.operatorAddress,
                    request.churnApprovalEcdsaPrivateKey,
                    request.blsKeyPair.getPubKeyG1(),
                    request.operatorKickParams!,
                );

            data = chainIoUtils.abiEncodeRegistrationWithChurnParams(
                request.socket,
                pubkeyRegParams,
                request.operatorKickParams!,
                signatureWithSaltAndExpiry,
            );
        } else {
            data = chainIoUtils.abiEncodeNormalRegistrationParams(
                request.socket,
                pubkeyRegParams,
            );
        }

        return await sendContractCall({
            contract: this.allocationManager,
            method: "registerForOperatorSets",
            params: [
                request.operatorAddress,
                {
                    avs: request.avsAddress,
                    operatorSetIds: request.operatorSetIds,
                    data,
                },
            ],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: Object.values(ABIs).flat(),
        });
    }

    async removePermission(request: {
        accountAddress: string;
        appointeeAddress: string;
        target: string;
        selector: Bytes;
    }): Promise<TransactionReceipt> {
        if (!this.permissionController)
            throw new Error("PermissionController contract not provided");

        return await sendContractCall({
            contract: this.permissionController,
            method: "removeAppointee",
            params: [
                request.accountAddress,
                request.appointeeAddress,
                request.target,
                request.selector,
            ],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.PERMISSION_CONTROLLER_ABI,
        });
    }

    async setPermission(request: {
        accountAddress: string;
        appointeeAddress: string;
        target: string;
        selector: Bytes;
    }): Promise<TransactionReceipt> {
        if (!this.permissionController)
            throw new Error("PermissionController contract not provided");

        return await sendContractCall({
            contract: this.permissionController,
            method: "setAppointee",
            params: [
                request.accountAddress,
                request.appointeeAddress,
                request.target,
                request.selector,
            ],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.PERMISSION_CONTROLLER_ABI,
        });
    }

    async acceptAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController)
            throw new Error("PermissionController contract not provided");

        return await sendContractCall({
            contract: this.permissionController,
            method: "acceptAdmin",
            params: [request.accountAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.PERMISSION_CONTROLLER_ABI,
        });
    }

    async addPendingAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController)
            throw new Error("PermissionController contract not provided");
        return await sendContractCall({
            contract: this.permissionController,
            method: "addPendingAdmin",
            params: [request.accountAddress, request.adminAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.PERMISSION_CONTROLLER_ABI,
        });
    }

    async removeAdmin(request: AdminRequest): Promise<TransactionReceipt> {
        if (!this.permissionController)
            throw new Error("PermissionController contract not provided");

        return await sendContractCall({
            contract: this.permissionController,
            method: "removeAdmin",
            params: [request.accountAddress, request.adminAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.PERMISSION_CONTROLLER_ABI,
        });
    }

    async removePendingAdmin(
        request: AdminRequest,
    ): Promise<TransactionReceipt> {
        if (!this.permissionController)
            throw new Error("PermissionController contract not provided");

        return await sendContractCall({
            contract: this.permissionController,
            method: "removePendingAdmin",
            params: [request.accountAddress, request.adminAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.PERMISSION_CONTROLLER_ABI,
        });
    }

    async getOperatorId(operatorAddress: string): Promise<Bytes> {
        if (!this.registryCoordinator)
            throw new Error("RegistryCoordinator contract not provided");
        return await this.registryCoordinator.methods
            .getOperatorId(operatorAddress)
            .call();
    }

    async setAvsRegistrar(
        avsAddress: string,
        registrarAddress: string,
    ): Promise<TransactionReceipt> {
        if (!this.allocationManager)
            throw new Error("AllocationManager contract not provided");

        return await sendContractCall({
            contract: this.allocationManager,
            method: "setAVSRegistrar",
            params: [avsAddress, registrarAddress],
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            abi: ABIs.ALLOCATION_MANAGER_ABI,
        });
    }
}
