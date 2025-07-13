import { Web3 } from 'web3';
import { clients, clientsArray, config } from '../builder';
import { describe, test, expect } from 'vitest';
import { Uint32 } from '../../types/general.js';
import pino from 'pino';

const logger = pino({
    level: 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
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
    test('deregisterFromOperatorSets', async () => {
        const operatorAddress = config.operator_address_1;
        const request: DeregisterRequest = {
            avs: config.service_manager_address,
            operatorSetIds: [0n],
        };
        const receipt = await clients.elWriter.deregisterFromOperatorSets(operatorAddress, request);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Deregistered from operator sets with tx hash: ${receipt.transactionHash}`);
    });

    test('updateMetadataUri', async () => {
        const operatorAddr = config.operator_address_1;
        const metadataUri = 'https://example.com/updated-metadata-uri';
        const receipt = await clients.elWriter.updateMetadataUri(operatorAddr, metadataUri);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Updated metadata URI with tx hash: ${receipt.transactionHash}`);
    });

    test('depositErc20IntoStrategy', async () => {
        const strategyAddr = config.strategy_addr;
        const amount = 100n;
        const receipt = await clients.elWriter.depositErc20IntoStrategy(strategyAddr, amount);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Deposited ERC20 tokens into strategy with tx hash: ${receipt.transactionHash}`);
    });

    test('setClaimerFor', async () => {
        const claimerAddr = config.operator_address_1;
        const receipt = await clients.elWriter.setClaimerFor(claimerAddr);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set claimer with tx hash: ${receipt.transactionHash}`);
    });

    test('setOperatorAvsSplit', async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = config.avs_address;
        const split = 5000n;
        const receipt = await clients.elWriter.setOperatorAvsSplit(operatorAddr, avsAddr, split);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set operator AVS split with tx hash: ${receipt.transactionHash}`);
    });

    test('setOperatorPiSplit', async () => {
        const operatorAddr = config.operator_address_1;
        const split = 3000n;
        const receipt = await clients.elWriter.setOperatorPiSplit(operatorAddr, split);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set operator PI split with tx hash: ${receipt.transactionHash}`);
    });

    test('clearDeallocationQueue', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const strategies = [strategyAddr];
        const numsToClear = [1n];
        const receipt = await clients.elWriter.clearDeallocationQueue(operatorAddr, strategies, numsToClear);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Cleared deallocation queue with tx hash: ${receipt.transactionHash}`);
    });

    test('setAllocationDelay', async () => {
        const operatorAddr = config.operator_address_1;
        const delay = 50n;
        const receipt = await clients.elWriter.setAllocationDelay(operatorAddr, delay);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set allocation delay with tx hash: ${receipt.transactionHash}`);
    });

    test('addPendingAdmin', async () => {
        const request: AddPendingAdminRequest = {
            accountAddress: config.operator_address_1,
            adminAddress: config.operator_address_1,
        };
        const receipt = await clients.elWriter.addPendingAdmin(request);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Added pending admin with tx hash: ${receipt.transactionHash}`);
    });

    test('removePendingAdmin', async () => {
        const request: AddPendingAdminRequest = {
            accountAddress: config.operator_address_1,
            adminAddress: config.operator_address_1,
        };
        const receipt = await clients.elWriter.removePendingAdmin(request);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Removed pending admin with tx hash: ${receipt.transactionHash}`);
    });

    test('acceptAdmin', async () => {
        // Call addPendingAdmin to set up the test
        const addRequest: AddPendingAdminRequest = {
            accountAddress: config.operator_address_1,
            adminAddress: config.operator_address_1,
        };
        await clients.elWriter.addPendingAdmin(addRequest);

        const request: AcceptAdminRequest = {
            accountAddress: config.operator_address_1,
        };
        const receipt = await clients.elWriter.acceptAdmin(request);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Accepted admin with tx hash: ${receipt.transactionHash}`);
    });

    test('setPermission', async () => {
        const request: SetPermissionRequest = {
            accountAddress: config.operator_address_1,
            appointeeAddress: config.operator_address_1,
            target: config.avs_address,
            selector: '0x12345678',
        };
        const receipt = await clients.elWriter.setPermission(request);
        expect(receipt.status).toBe(1);
        logger.info(`Set permission with tx hash: ${receipt.transactionHash}`);
    });

    test('removePermission', async () => {
        const request: RemovePermissionRequest = {
            accountAddress: config.operator_address_1,
            appointeeAddress: config.operator_address_1,
            target: config.avs_address,
            selector: '0x12345678',
        };
        const receipt = await clients.elWriter.removePermission(request);
        expect(receipt.status).toBe(1);
        logger.info(`Removed permission with tx hash: ${receipt.transactionHash}`);
    });

    test('removeAdminFlow', async () => {
        const accountAddress = config.operator_address_1;
        const admin2Address = clientsArray[1].ethHttpClient.utils.toChecksumAddress(config.operator_address_2);

        let receipt = await clients.elWriter.addPendingAdmin({
            accountAddress,
            adminAddress: admin2Address,
        });
        expect(receipt.status).toBe(1);
        logger.info(`Added pending admin with tx hash: ${receipt.transactionHash}`);

        receipt = await clientsArray[1].elWriter.acceptAdmin({
            accountAddress,
        });
        expect(receipt.status).toBe(1);
        logger.info(`Accepted admin with tx hash: ${receipt.transactionHash}`);

        receipt = await clients.elWriter.removeAdmin({
            accountAddress,
            adminAddress: admin2Address,
        });
        expect(receipt.status).toBe(1);
        logger.info(`Removed admin with tx hash: ${receipt.transactionHash}`);
    });

    test('modifyAllocations', async () => {
        const operatorAddress = config.operator_address_1;
        const avsServiceManager = config.service_manager_address;
        const operatorSetId = 0n;
        const strategies = [config.strategy_addr];
        const newMagnitudes = [1000n];
        const receipt = await clients.elWriter.modifyAllocations(
            operatorAddress,
            avsServiceManager,
            operatorSetId,
            strategies,
            newMagnitudes
        );
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Modified allocations with tx hash: ${receipt.transactionHash}`);
    });
});