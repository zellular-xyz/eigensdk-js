// import { ethers } from "ethers";
import { pino, Logger } from "pino";
// import { ELReader, G1Point, KeyPair, TxReceipt, utils, sendTransaction } from "./utils";
import { ELReader } from '../elcontracts/reader'
import { Web3, Contract, Address, TransactionReceipt } from "web3";
import { ethers } from 'ethers'
import { G1Point, KeyPair, Signature } from "../../../crypto/bls/attestation";
import * as chainIoUtils from '../../utils'
import * as ABIs from '../../../contracts/ABIs'
import { LocalAccount, OperatorDirectedRewardsSubmissions, OperatorSetParams, QuorumNum, RewardsSubmission, StrategyParams, Uint16, Uint256, Uint32, Uint96 } from "../../../types/general";
import { signRawData } from "../../../utils/helpers";

const DEFAULT_QUERY_BLOCK_RANGE = 10_000;
const logger = pino({ name: "AvsRegWriter" })


export class AvsRegistryWriter {
    serviceManagerAddr: Address;
    serviceManager: Contract<typeof ABIs.SERVICE_MANAGER_BASE_ABI>;
    registryCoordinator: Contract<typeof ABIs.REGISTRY_COORDINATOR_ABI>;
    operatorStateRetriever: Contract<typeof ABIs.OPERATOR_STATE_RETRIEVER_ABI>;
    stakeRegistry: Contract<typeof ABIs.STAKE_REGISTRY_ABI>;
    blsApkRegistry: Contract<typeof ABIs.BLS_APK_REGISTRY_ABI>;
    elReader: ELReader;
    logger: Logger;
    ethHttpClient: Web3;
    pkWallet: LocalAccount;
    transactor: chainIoUtils.Transactor;

    constructor(
        registryCoordinator: Contract<typeof ABIs.REGISTRY_COORDINATOR_ABI>,
        operatorStateRetriever: Contract<typeof ABIs.OPERATOR_STATE_RETRIEVER_ABI>,
        serviceManager: Contract<typeof ABIs.SERVICE_MANAGER_BASE_ABI>,
        serviceManagerAddr: Address,
        stakeRegistry: Contract<typeof ABIs.STAKE_REGISTRY_ABI>,
        blsApkRegistry: Contract<typeof ABIs.BLS_APK_REGISTRY_ABI>,
        elReader: ELReader,
        logger: Logger,
        ethHttpClient: Web3,
        pkWallet: LocalAccount,
    ) {
        this.registryCoordinator = registryCoordinator;
        this.operatorStateRetriever = operatorStateRetriever;
        this.serviceManager = serviceManager;
        this.serviceManagerAddr = serviceManagerAddr;
        this.stakeRegistry = stakeRegistry;
        this.blsApkRegistry = blsApkRegistry;
        this.elReader = elReader;
        this.logger = logger;

        this.ethHttpClient = ethHttpClient;
        this.pkWallet = pkWallet;

        this.transactor = new chainIoUtils.Transactor(pkWallet, ethHttpClient);
    }

    async sendTransaction(contract: Contract<any>, method: string, params: any[]): Promise<TransactionReceipt> {
        return this.transactor.send(contract, method, params)
    }

    async updateStakesOfEntireOperatorSetForQuorums(
        operatorsPerQuorum: string[][],
        quorumNumbers: QuorumNum[]
    ): Promise<TransactionReceipt> {
        const quorumBytes = chainIoUtils.numsToBytes(quorumNumbers.map(Number));
        return await this.sendTransaction(
            this.registryCoordinator,
            'updateOperatorsForQuorum',
            [operatorsPerQuorum, quorumBytes]
        );
    }

    async updateStakesOfOperatorSubsetForAllQuorums(
        operators: string[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'updateOperators',
            [operators]
        );
    }

    async updateSocket(socket: string): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'updateSocket',
            [socket]
        );
    }

    async setRewardsInitiator(rewardsInitiatorAddr: string): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.serviceManager,
            'setRewardsInitiator',
            [rewardsInitiatorAddr]
        );
    }

    async setSlashableStakeLookahead(
        quorumNumber: number,
        lookAheadPeriod: number
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.stakeRegistry,
            'setSlashableStakeLookahead',
            [quorumNumber, lookAheadPeriod]
        );
    }

    async setMinimumStakeForQuorum(
        quorumNumber: number,
        minimumStake: number
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.stakeRegistry,
            'setMinimumStakeForQuorum',
            [quorumNumber, minimumStake]
        );
    }

    async createTotalDelegatedStakeQuorum(
        operatorSetParams: OperatorSetParams,
        minimumStakeRequired: Uint96,
        strategyParams: StrategyParams[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'createTotalDelegatedStakeQuorum',
            [operatorSetParams, minimumStakeRequired, strategyParams]
        );
    }

    async createSlashableStakeQuorum(
        operatorSetParams: OperatorSetParams,
        minimumStakeRequired: Uint96,
        strategyParams: StrategyParams[],
        lookAheadPeriod: Uint32
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'createSlashableStakeQuorum',
            [operatorSetParams, minimumStakeRequired, strategyParams, lookAheadPeriod]
        );
    }

    async ejectOperator(
        operatorAddress: string,
        quorumNumbers: QuorumNum[]
    ): Promise<TransactionReceipt> {
        const quorumBytes = chainIoUtils.numsToBytes(quorumNumbers.map(Number));
        return await this.sendTransaction(
            this.registryCoordinator,
            'ejectOperator',
            [operatorAddress, quorumBytes]
        );
    }

    async setOperatorSetParams(
        quorumNumber: number,
        operatorSetParams: OperatorSetParams
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'setOperatorSetParams',
            [quorumNumber, operatorSetParams]
        );
    }

    async setChurnApprover(churnApproverAddress: string): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'setChurnApprover',
            [churnApproverAddress]
        );
    }

    async setEjector(ejectorAddress: string): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'setEjector',
            [ejectorAddress]
        );
    }

    async modifyStrategyParams(
        quorumNumber: number,
        strategyIndices: number[],
        multipliers: number[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.stakeRegistry,
            'modifyStrategyParams',
            [quorumNumber, strategyIndices, multipliers]
        );
    }

    async setAvs(avsAddress: string): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'setAVS',
            [avsAddress]
        );
    }

    async setEjectionCooldown(ejectionCooldown: number): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.registryCoordinator,
            'setEjectionCooldown',
            [ejectionCooldown]
        );
    }

    async addStrategies(
        quorumNumber: number,
        strategyParams: StrategyParams[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.stakeRegistry,
            'addStrategies',
            [quorumNumber, strategyParams]
        );
    }

    async updateAvsMetadataUri(metadataUri: string): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.serviceManager,
            'updateAVSMetadataURI',
            [metadataUri]
        );
    }

    async removeStrategies(
        quorumNumber: number,
        indicesToRemove: number[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.stakeRegistry,
            'removeStrategies',
            [quorumNumber, indicesToRemove]
        );
    }

    async createAvsRewardsSubmission(
        rewardsSubmission: RewardsSubmission[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.serviceManager,
            'createAVSRewardsSubmission',
            [rewardsSubmission]
        );
    }

    async createOperatorDirectedAvsRewardsSubmission(
        operatorDirectedRewardsSubmissions: OperatorDirectedRewardsSubmissions[]
    ): Promise<TransactionReceipt> {
        return await this.sendTransaction(
            this.serviceManager,
            'createOperatorDirectedAVSRewardsSubmission',
            [operatorDirectedRewardsSubmissions]
        );
    }
}