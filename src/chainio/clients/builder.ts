import { ethers } from 'ethers';
import { Web3 } from 'web3';
import { AbiItem } from 'web3-utils';
import pino, { Logger } from 'pino';
import * as ABIs from '../../contracts/ABIs';

import {AvsRegistryReader} from './avsregistry/reader';
import {AvsRegistryWriter} from './avsregistry/writer';
import {ELReader} from './elcontracts/reader';
import {ELWriter} from './elcontracts/writer';
import { LocalAccount } from '../../types/general';

const logger = pino({ 
	level: 'info',
	transport: {
		target: 'pino-pretty'
	}
});

export class BuildAllConfig {

    constructor(
        public readonly ethHttpUrl: string,
        public readonly registryCoordinatorAddr: string,
        public readonly operatorStateRetrieverAddr: string,
        public readonly rewardsCoordinatorAddr: string,
        public readonly permissionControllerAddr: string,
        public readonly serviceManagerAddr: string,
        public readonly allocationManagerAddr: string,
        public readonly delegationManagerAddr: string,
        public readonly avsName: string,
        public readonly promMetricsIpPortAddress?: string
    ) {}

    async buildElClients(ecdsaPrivateKey: string): Promise<[ELReader, ELWriter]> {
        const ethHttpClient = new Web3(new Web3.providers.HttpProvider(this.ethHttpUrl));
        const pkWallet: LocalAccount = {
            address: new ethers.Wallet(ecdsaPrivateKey).address,
            privateKey: ecdsaPrivateKey.replace("0x", ""),
        };

        const registryCoordinator = new ethHttpClient.eth.Contract(
            ABIs.REGISTRY_COORDINATOR_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.registryCoordinatorAddr)
        );
        logger.info(`registry_coordinator_instance: ${registryCoordinator.options.address}`);

        const stakeRegistryAddr: string = await registryCoordinator.methods.stakeRegistry().call();
        const stakeRegistry = new ethHttpClient.eth.Contract(
            ABIs.STAKE_REGISTRY_ABI as AbiItem[],
            stakeRegistryAddr
        );
        logger.info(`stake_registry_instance: ${stakeRegistry.options.address}`);

        const delegationManagerAddr: string = await stakeRegistry.methods.delegation().call();
        const delegationManager = new ethHttpClient.eth.Contract(
            ABIs.DELEGATION_MANAGER_ABI as AbiItem[],
            delegationManagerAddr
        );
        logger.info(`delegation_manager_instance: ${delegationManager.options.address}`);

        const strategyManagerAddr: string = await delegationManager.methods.strategyManager().call();
        const strategyManager = new ethHttpClient.eth.Contract(
            ABIs.STRATEGY_MANAGER_ABI as AbiItem[],
            strategyManagerAddr
        );
        logger.info(`strategy_manager_instance: ${strategyManager.options.address}`);

        const serviceManager = new ethHttpClient.eth.Contract(
            ABIs.SERVICE_MANAGER_BASE_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.serviceManagerAddr)
        );
        logger.info(`service_manager_instance: ${serviceManager.options.address}`);

        const allocationManager = new ethHttpClient.eth.Contract(
            ABIs.ALLOCATION_MANAGER_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.allocationManagerAddr)
        );
        logger.info(`allocation_manager_instance: ${allocationManager.options.address}`);

        const permissionController = new ethHttpClient.eth.Contract(
            ABIs.PERMISSION_CONTROLLER_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.permissionControllerAddr)
        );
        logger.info(`permission_controller_instance: ${permissionController.options.address}`);

        const avsDirectoryAddr: string = await serviceManager.methods.avsDirectory().call();
        const avsDirectory = new ethHttpClient.eth.Contract(
            ABIs.AVS_DIRECTORY_ABI as AbiItem[],
            avsDirectoryAddr
        );
        logger.info(`avs_directory_instance: ${avsDirectory.options.address}`);

        const rewardsCoordinator = new ethHttpClient.eth.Contract(
            ABIs.REWARDS_COORDINATOR_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.rewardsCoordinatorAddr)
        );
        logger.info(`rewards_coordinator_instance: ${rewardsCoordinator.options.address}`);

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
            ABIs.IERC20_ABI
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
            ABIs.IERC20_ABI
        );

        return [elReaderInstance, elWriterInstance];
    }

    async buildAvsRegistryClients(
        ecdsaPrivateKey: string,
        elReader: ELReader
    ): Promise<[AvsRegistryReader, AvsRegistryWriter]> {
        const ethHttpClient = new Web3(new Web3.providers.HttpProvider(this.ethHttpUrl));
        const pkWallet: LocalAccount = {
            address: new ethers.Wallet(ecdsaPrivateKey).address,
            privateKey: ecdsaPrivateKey.replace("0x", ""),
        };

        const registryCoordinator = new ethHttpClient.eth.Contract(
            ABIs.REGISTRY_COORDINATOR_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.registryCoordinatorAddr)
        );
        logger.info(`registry_coordinator_instance: ${registryCoordinator.options.address}`);

        const operatorStateRetriever = new ethHttpClient.eth.Contract(
            ABIs.OPERATOR_STATE_RETRIEVER_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.operatorStateRetrieverAddr)
        );
        logger.info(`operator_state_retriever_instance: ${operatorStateRetriever.options.address}`);

        const blsApkRegistryAddr: string = await registryCoordinator.methods.blsApkRegistry().call();
        const blsApkRegistry = new ethHttpClient.eth.Contract(
            ABIs.BLS_APK_REGISTRY_ABI as AbiItem[],
            blsApkRegistryAddr
        );
        logger.info(`bls_apk_registry_instance: ${blsApkRegistry.options.address}`);

        const serviceManager = new ethHttpClient.eth.Contract(
            ABIs.SERVICE_MANAGER_BASE_ABI as AbiItem[],
            ethHttpClient.utils.toChecksumAddress(this.serviceManagerAddr)
        );
        logger.info(`service_manager_instance: ${serviceManager.options.address}`);

        const stakeRegistryAddr: string = await registryCoordinator.methods.stakeRegistry().call();
        const stakeRegistry = new ethHttpClient.eth.Contract(
            ABIs.STAKE_REGISTRY_ABI as AbiItem[],
            stakeRegistryAddr
        );
        logger.info(`stake_registry_instance: ${stakeRegistry.options.address}`);

        const avsRegistryReader = new AvsRegistryReader(
            registryCoordinator,
            ethHttpClient.utils.toChecksumAddress(this.registryCoordinatorAddr),
            blsApkRegistry,
            blsApkRegistryAddr,
            operatorStateRetriever,
            serviceManager,
            stakeRegistry,
            logger,
            ethHttpClient
        );

        const avsRegistryWriter = new AvsRegistryWriter(
            registryCoordinator,
            operatorStateRetriever,
            serviceManager,
            ethHttpClient.utils.toChecksumAddress(this.serviceManagerAddr),
            stakeRegistry,
            blsApkRegistry,
            elReader,
            logger,
            ethHttpClient,
            pkWallet
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
        public readonly wallet: LocalAccount,
        public readonly metrics: any
    ) {}
}

export async function buildAll(config: BuildAllConfig, ecdsaPrivateKey: string, logger?: Logger): Promise<Clients> {
    const ethHttpClient = new Web3(new Web3.providers.HttpProvider(config.ethHttpUrl));
    console.log({config, ecdsaPrivateKey})
	const wallet = new ethers.Wallet(ecdsaPrivateKey);
    const pkWallet:LocalAccount = {
		address: wallet.address,
		privateKey: ecdsaPrivateKey.replace("0x", "")
	}

    const [elReader, elWriter] = await config.buildElClients(ecdsaPrivateKey);

    const [avsRegistryReader, avsRegistryWriter] = await config.buildAvsRegistryClients(ecdsaPrivateKey, elReader);

    return new Clients(
        avsRegistryReader,
        avsRegistryWriter,
        elReader,
        elWriter,
        ethHttpClient,
        pkWallet,
        null
    );
}
