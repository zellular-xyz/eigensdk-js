import { Web3 } from 'web3';
import { buildClients, config } from '../builder';
import { Clients } from '../../chainio/clients/builder.js';
import * as testUtils from '../utils/anvil.js';
import { init as attestationInit, KeyPair } from '../../crypto/bls/attestation.js';
import { describe, test, expect, beforeAll } from 'vitest';
import { ContractAddresses, Uint32 } from '../../types/general.js';
import pino from 'pino';

const logger = pino({
    level: 'silent', // Set log level here
    transport: {
        target: 'pino-pretty',
        options: { 
            colorize: true,
            sync: true // Ensure pino-pretty is synchronous
        }
    },
});


// Define TypeScript interfaces for Python dictionaries
interface DeregisterRequest {
    avs: string;
    operatorSetIds: Uint32[];
}

interface AddPendingAdminRequest {
    accountAddress: string;
    adminAddress: string;
}

interface AcceptAdminRequest {
    accountAddress: string;
}

interface SetPermissionRequest {
    accountAddress: string;
    appointeeAddress: string;
    target: string;
    selector: string;
}

interface RemovePermissionRequest {
    accountAddress: string;
    appointeeAddress: string;
    target: string;
    selector: string;
}

interface RemoveAdminRequest {
    accountAddress: string;
    adminAddress: string;
}



describe('ELWriter', () => {
    let clients: Clients[];
    let addresses: ContractAddresses;
    let client0: Clients;

    beforeAll(async() => {
        await attestationInit();
        
        const testConfigs = testUtils.getDefaultTestConfig(); 
        const {container, endpoint} = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        ({clients, addresses} = await buildClients(endpoint));
        client0 = clients[0];
    }); 

    describe("")

    // test('deregisterFromOperatorSets', async () => {
    //     const operatorAddress = config.operator_address_1;

    //     const regReceipt = await client0.elWriter.registerForOperatorSets(
    //         addresses.registryCoordinator,
    //         {
    //             operatorAddress: operatorAddress,
    //             avsAddress: addresses.serviceManager,
    //             operatorSetIds: [0n],
    //             socket: 'operator-socket',
    //             blsKeyPair: new KeyPair(),
    //         }
    //     );
    //     expect(regReceipt).not.toBeNull();
    //     expect(regReceipt.status).toBe(1n);
    //     logger.info(`Registered from operator sets with tx hash: ${regReceipt.transactionHash}`);

    //     const request: DeregisterRequest = {
    //         avs: addresses.serviceManager,
    //         operatorSetIds: [0n],
    //     };
    //     const receipt = await client0.elWriter.deregisterFromOperatorSets(operatorAddress, request);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Deregistered from operator sets with tx hash: ${receipt.transactionHash}`);

    // });

    // test('updateMetadataUri', async () => {
    //     const operatorAddr = config.operator_address_1;
    //     const metadataUri = 'https://example.com/updated-metadata-uri';
        
    //     const receipt = await client0.elWriter.updateMetadataUri(operatorAddr, metadataUri);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Updated metadata URI with tx hash: ${receipt.transactionHash}`);
            
    // });

    // test('depositErc20IntoStrategy', async () => {
    //     const strategyAddr = addresses.erc20MockStrategy;
    //     const amount = 100n;
    //     const receipt = await client0.elWriter.depositErc20IntoStrategy(strategyAddr, amount);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Deposited ERC20 tokens into strategy with tx hash: ${receipt.transactionHash}`);
    // });

    // test('setClaimerFor', async () => {
    //     const claimerAddr = config.operator_address_1;
    //     const receipt = await client0.elWriter.setClaimerFor(claimerAddr);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Set claimer with tx hash: ${receipt.transactionHash}`);
    // });

    // test('setOperatorAvsSplit', async () => {
    //     const operatorAddr = config.operator_address_1;
    //     const avsAddr = addresses.avsAddress;
    //     const split = 5000n;
    //     const receipt = await client0.elWriter.setOperatorAvsSplit(operatorAddr, avsAddr, split);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Set operator AVS split with tx hash: ${receipt.transactionHash}`);
    // });

    // test('setOperatorPiSplit', async () => {
    //     const operatorAddr = config.operator_address_1;
    //     const split = 3000n;
    //     const receipt = await client0.elWriter.setOperatorPiSplit(operatorAddr, split);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Set operator PI split with tx hash: ${receipt.transactionHash}`);
    // });

    // test('clearDeallocationQueue', async () => {
    //     const operatorAddr = config.operator_address_1;
    //     const strategyAddr = addresses.erc20MockStrategy;
    //     const strategies = [strategyAddr];
    //     const numsToClear = [1n];
    //     const receipt = await client0.elWriter.clearDeallocationQueue(operatorAddr, strategies, numsToClear);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Cleared deallocation queue with tx hash: ${receipt.transactionHash}`);
    // });

    test('setAllocationDelay', async () => {
        const operatorAddr = config.operator_address_1;

        const delay = 10n;
        const receipt = await client0.elWriter.setAllocationDelay(operatorAddr, delay);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);

        console.log({operatorAddr, delay})

        const allocationDelay = await client0.elReader.getAllocationDelay(operatorAddr);
        expect(allocationDelay).toBe(delay);

        logger.info(`Set allocation delay with tx hash: ${receipt.transactionHash}`);
    });

    // test('addPendingAdmin', async () => {
    //     const request: AddPendingAdminRequest = {
    //         accountAddress: config.operator_address_1,
    //         adminAddress: config.operator_address_1,
    //     };
    //     const receipt = await client0.elWriter.addPendingAdmin(request);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Added pending admin with tx hash: ${receipt.transactionHash}`);
    // });

    // test('removePendingAdmin', async () => {
    //     const request: AddPendingAdminRequest = {
    //         accountAddress: config.operator_address_1,
    //         adminAddress: config.operator_address_1,
    //     };
    //     const receipt = await client0.elWriter.removePendingAdmin(request);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Removed pending admin with tx hash: ${receipt.transactionHash}`);
    // });

    // test('acceptAdmin', async () => {
    //     // Call addPendingAdmin to set up the test
    //     const addRequest: AddPendingAdminRequest = {
    //         accountAddress: config.operator_address_1,
    //         adminAddress: config.operator_address_1,
    //     };
    //     await client0.elWriter.addPendingAdmin(addRequest);

    //     const request: AcceptAdminRequest = {
    //         accountAddress: config.operator_address_1,
    //     };
    //     const receipt = await client0.elWriter.acceptAdmin(request);
    //     expect(receipt).not.toBeNull();
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Accepted admin with tx hash: ${receipt.transactionHash}`);
    // });

    // test('setPermission', async () => {
    //     const request: SetPermissionRequest = {
    //         accountAddress: config.operator_address_1,
    //         appointeeAddress: config.operator_address_1,
    //         target: addresses.avsAddress,
    //         selector: '0x12345678',
    //     };
    //     const receipt = await client0.elWriter.setPermission(request);
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Set permission with tx hash: ${receipt.transactionHash}`);
    // });

    // test('removePermission', async () => {
    //     const request: RemovePermissionRequest = {
    //         accountAddress: config.operator_address_1,
    //         appointeeAddress: config.operator_address_1,
    //         target: addresses.avsAddress,
    //         selector: '0x12345678',
    //     };
    //     const receipt = await client0.elWriter.removePermission(request);
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Removed permission with tx hash: ${receipt.transactionHash}`);
    // });

    // test('removeAdminFlow', async () => {
    //     const accountAddress = config.operator_address_1;
    //     const admin2Address = clients[1].ethHttpClient.utils.toChecksumAddress(config.operator_address_2);

    //     let receipt = await client0.elWriter.addPendingAdmin({
    //         accountAddress,
    //         adminAddress: admin2Address,
    //     });
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Added pending admin with tx hash: ${receipt.transactionHash}`);

    //     receipt = await clients[1].elWriter.acceptAdmin({
    //         accountAddress,
    //     });
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Accepted admin with tx hash: ${receipt.transactionHash}`);

    //     receipt = await client0.elWriter.removeAdmin({
    //         accountAddress,
    //         adminAddress: admin2Address,
    //     });
    //     expect(receipt.status).toBe(1n);
    //     logger.info(`Removed admin with tx hash: ${receipt.transactionHash}`);
    // });

    // test('modifyAllocations', async () => {
    //     const operatorAddress = config.operator_address_1;
    //     const avsServiceManager = addresses.serviceManager;
    //     const operatorSetId = 0n;
    //     const strategies = [addresses.erc20MockStrategy];
    //     const newMagnitudes = [1000n];
    //     try {
    //         const allocationDelay = await client0.elReader.getAllocationDelay(operatorAddress);
    //         console.log({allocationDelay})

    //         const receipt = await client0.elWriter.modifyAllocations(
    //             operatorAddress,
    //             avsServiceManager,
    //             operatorSetId,
    //             strategies,
    //             newMagnitudes
    //         );
    //         expect(receipt).not.toBeNull();
    //         expect(receipt.status).toBe(1n);
    //         logger.info(`Modified allocations with tx hash: ${receipt.transactionHash}`);
    //     }
    //     catch(e) {
    //         console.log(e)
    //         throw e
    //     }
    // });
});