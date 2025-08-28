import { ethers } from "ethers";
import { Web3 } from "web3";
import { AbiItem } from "web3-utils";
import pino, { Logger } from "pino";
import * as ABIs from "../../contracts/ABIs";

import { AvsRegistryReader } from "./avsregistry/reader";
import { AvsRegistryWriter } from "./avsregistry/writer";
import { ELReader } from "./elcontracts/reader";
import { ELWriter } from "./elcontracts/writer";
import { LocalAccount } from "../../types/general";
import { loadLocalAccount } from "../utils.js";
import { obj2arr } from "../../utils/helpers.js";

const logger = pino({
    level: process.env.LOG_LEVEL || "silent",
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            sync: true, // Ensure pino-pretty is synchronous
        },
    },
});

export type BuildParams = {
    avsName: string;
    ethHttpUrl: string;
    registryCoordinatorAddr: string;
    operatorStateRetrieverAddr: string;
    rewardsCoordinatorAddr: string;
    permissionControllerAddr: string;
    serviceManagerAddr: string;
    allocationManagerAddr: string;
    delegationManagerAddr: string;
    promMetricsIpPortAddress?: string;
};

export class BuildAllConfig {
    constructor(public readonly buildParams: BuildParams) {}

    async buildElClients(
        ecdsaPrivateKey: string,
    ): Promise<[ELReader, ELWriter]> {
        const ethHttpClient = new Web3(
            new Web3.providers.HttpProvider(this.buildParams.ethHttpUrl),
        );
        const pkWallet: LocalAccount = loadLocalAccount(ecdsaPrivateKey);

        const registryCoordinator = new ethHttpClient.eth.Contract(
            ABIs.REGISTRY_COORDINATOR_ABI as AbiItem[],
            this.buildParams.registryCoordinatorAddr,
        );
        logger.info(
            `registry_coordinator_instance: ${registryCoordinator.options.address}`,
        );

        const stakeRegistryAddr: string = await registryCoordinator.methods
            .stakeRegistry()
            .call();
        const stakeRegistry = new ethHttpClient.eth.Contract(
            ABIs.STAKE_REGISTRY_ABI as AbiItem[],
            stakeRegistryAddr,
        );
        logger.info(
            `stake_registry_instance: ${stakeRegistry.options.address}`,
        );

        const delegationManagerAddr: string = await stakeRegistry.methods
            .delegation()
            .call();
        const delegationManager = new ethHttpClient.eth.Contract(
            ABIs.DELEGATION_MANAGER_ABI as AbiItem[],
            delegationManagerAddr,
        );
        logger.info(
            `delegation_manager_instance: ${delegationManager.options.address}`,
        );

        const strategyManagerAddr: string = await delegationManager.methods
            .strategyManager()
            .call();
        const strategyManager = new ethHttpClient.eth.Contract(
            ABIs.STRATEGY_MANAGER_ABI as AbiItem[],
            strategyManagerAddr,
        );
        logger.info(
            `strategy_manager_instance: ${strategyManager.options.address}`,
        );

        const serviceManager = new ethHttpClient.eth.Contract(
            ABIs.SERVICE_MANAGER_BASE_ABI as AbiItem[],
            this.buildParams.serviceManagerAddr,
        );
        logger.info(
            `service_manager_instance: ${serviceManager.options.address}`,
        );

        const allocationManager = new ethHttpClient.eth.Contract(
            ABIs.ALLOCATION_MANAGER_ABI as AbiItem[],
            this.buildParams.allocationManagerAddr,
        );
        logger.info(
            `allocation_manager_instance: ${allocationManager.options.address}`,
        );

        const permissionController = new ethHttpClient.eth.Contract(
            ABIs.PERMISSION_CONTROLLER_ABI as AbiItem[],
            this.buildParams.permissionControllerAddr,
        );
        logger.info(
            `permission_controller_instance: ${permissionController.options.address}`,
        );

        const avsDirectoryAddr: string = await serviceManager.methods
            .avsDirectory()
            .call();
        const avsDirectory = new ethHttpClient.eth.Contract(
            ABIs.AVS_DIRECTORY_ABI as AbiItem[],
            avsDirectoryAddr,
        );
        logger.info(`avs_directory_instance: ${avsDirectory.options.address}`);

        const rewardsCoordinator = new ethHttpClient.eth.Contract(
            ABIs.REWARDS_COORDINATOR_ABI as AbiItem[],
            this.buildParams.rewardsCoordinatorAddr,
        );
        logger.info(
            `rewards_coordinator_instance: ${rewardsCoordinator.options.address}`,
        );

        const elReaderInstance = new ELReader(
            allocationManager,
            avsDirectory,
            delegationManager,
            permissionController,
            rewardsCoordinator,
            strategyManager,
            logger,
            ethHttpClient,
            ABIs.I_STRATEGY_ABI,
            ABIs.IERC20_ABI,
        );

        const elWriterInstance = new ELWriter(
            allocationManager,
            avsDirectory,
            delegationManager,
            permissionController,
            rewardsCoordinator,
            registryCoordinator,
            strategyManager,
            elReaderInstance,
            ethHttpClient,
            logger,
            pkWallet,
            ABIs.I_STRATEGY_ABI,
            ABIs.IERC20_ABI,
        );

        return [elReaderInstance, elWriterInstance];
    }

    async buildAvsRegistryClients(
        ecdsaPrivateKey: string,
        elReader: ELReader,
    ): Promise<[AvsRegistryReader, AvsRegistryWriter]> {
        const ethHttpClient = new Web3(
            new Web3.providers.HttpProvider(this.buildParams.ethHttpUrl),
        );
        const pkWallet: LocalAccount = loadLocalAccount(ecdsaPrivateKey);

        const registryCoordinator = new ethHttpClient.eth.Contract(
            ABIs.REGISTRY_COORDINATOR_ABI as AbiItem[],
            this.buildParams.registryCoordinatorAddr,
        );
        logger.info(
            `registry_coordinator_instance: ${registryCoordinator.options.address}`,
        );

        const operatorStateRetriever = new ethHttpClient.eth.Contract(
            ABIs.OPERATOR_STATE_RETRIEVER_ABI as AbiItem[],
            this.buildParams.operatorStateRetrieverAddr,
        );
        logger.info(
            `operator_state_retriever_instance: ${operatorStateRetriever.options.address}`,
        );

        const blsApkRegistryAddr: string = await registryCoordinator.methods
            .blsApkRegistry()
            .call();
        const blsApkRegistry = new ethHttpClient.eth.Contract(
            ABIs.BLS_APK_REGISTRY_ABI as AbiItem[],
            blsApkRegistryAddr,
        );
        logger.info(
            `bls_apk_registry_instance: ${blsApkRegistry.options.address}`,
        );

        const serviceManager = new ethHttpClient.eth.Contract(
            ABIs.SERVICE_MANAGER_BASE_ABI as AbiItem[],
            this.buildParams.serviceManagerAddr,
        );
        logger.info(
            `service_manager_instance: ${serviceManager.options.address}`,
        );

        const stakeRegistryAddr: string = await registryCoordinator.methods
            .stakeRegistry()
            .call();
        const stakeRegistry = new ethHttpClient.eth.Contract(
            ABIs.STAKE_REGISTRY_ABI as AbiItem[],
            stakeRegistryAddr,
        );
        logger.info(
            `stake_registry_instance: ${stakeRegistry.options.address}`,
        );

        const avsRegistryReader = new AvsRegistryReader(
            registryCoordinator,
            this.buildParams.registryCoordinatorAddr,
            blsApkRegistry,
            blsApkRegistryAddr,
            operatorStateRetriever,
            serviceManager,
            stakeRegistry,
            logger,
            ethHttpClient,
        );

        const avsRegistryWriter = new AvsRegistryWriter(
            registryCoordinator,
            operatorStateRetriever,
            serviceManager,
            this.buildParams.serviceManagerAddr,
            stakeRegistry,
            blsApkRegistry,
            elReader,
            logger,
            ethHttpClient,
            pkWallet,
        );

        return [avsRegistryReader, avsRegistryWriter];
    }
}

export class Clients {
    constructor(
        public readonly avsRegistryReader: AvsRegistryReader,
        public readonly avsRegistryWriter: AvsRegistryWriter,
        public readonly elReader: ELReader,
        public readonly elWriter: ELWriter,
        public readonly ethHttpClient: Web3,
        public readonly pkWallet: LocalAccount,
        public readonly metrics: any,
    ) {}
}

export async function buildAll(
    config: BuildAllConfig,
    ecdsaPrivateKey: string,
    logger?: Logger,
): Promise<Clients> {
    const ethHttpClient = new Web3(
        new Web3.providers.HttpProvider(config.buildParams.ethHttpUrl),
    );
    const pkWallet: LocalAccount = loadLocalAccount(ecdsaPrivateKey);

    const [elReader, elWriter] = await config.buildElClients(ecdsaPrivateKey);

    const [avsRegistryReader, avsRegistryWriter] =
        await config.buildAvsRegistryClients(ecdsaPrivateKey, elReader);

    return new Clients(
        avsRegistryReader,
        avsRegistryWriter,
        elReader,
        elWriter,
        ethHttpClient,
        pkWallet,
        null,
    );
}
