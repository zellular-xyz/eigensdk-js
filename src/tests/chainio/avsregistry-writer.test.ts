import { Web3 } from 'web3';
import { buildClients, config } from '../builder.js';
import { describe, test, expect, beforeAll, } from 'vitest';
import { G1Point, KeyPair, init as attestationInit } from '../../crypto/bls/attestation.js';
import {
    Operator, OperatorSetParams, RewardsSubmission,
    OperatorDirectedRewardsSubmission, StrategyParams
} from '../../types/general.js';
import * as ABIs from '../../contracts/ABIs'
import pino from 'pino';
import { Clients } from '../../chainio/clients/builder.js';
import * as testUtils from '../utils/anvil.js';
import { decodeTxReceiptLogs } from '../../utils/helpers.js';

const logger = pino({
    level: 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
    },
});

const test2 = (a: any, b: any) => { }

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.sequential('AvsRegistryWriter', () => {
    let clients: Clients[];
    let addresses: testUtils.ContractAddresses;
    let client0: Clients;

    beforeAll(async () => {
        await attestationInit();

        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        ({ clients, addresses } = await buildClients(endpoint));
        client0 = clients[0];
    })

    test('registerAsOperatorForOperatorSets', async () => {
        for (let i = 0; i < 3; i++) {
            // @ts-ignore
            const address = config[`operator_address_${i + 1}`];
            // const operator: Operator = {
            //     address,
            //     earningsReceiverAddress: address,
            //     delegationApproverAddress: '0x0000000000000000000000000000000000000000',
            //     allocationDelay: 50n,
            //     metadataUrl: 'https://example.com/operator-metadata',
            //     stakerOptOutWindowBlocks: 100n,
            // };
            // const receipt = await clients[i].elWriter.registerAsOperator(operator);
            // expect(receipt).not.toBeNull();
            // expect(receipt.status).toBe(1n);
            // logger.info(`Registered operator with tx hash: ${receipt.transactionHash}`);

            const setReceipt = await clients[i].elWriter.registerForOperatorSets(
                addresses.registryCoordinator,
                {
                    operatorAddress: address,
                    avsAddress: addresses.serviceManager,
                    operatorSetIds: [0n],
                    socket: 'operator-socket',
                    blsKeyPair: new KeyPair(),
                }
            );
            expect(setReceipt.status).toBe(1n);
            logger.info(`Registered for operator sets with tx hash: ${setReceipt.transactionHash}`);
        }
    });

    test('updateStakesOfEntireOperatorSetForQuorums', async () => {
        const operatorsPerQuorum = [[
            config.operator_address_3,
            config.operator_address_2,
            config.operator_address_1,
        ]];
        const receipt = await client0.avsRegistryWriter.updateStakesOfEntireOperatorSetForQuorums(
            operatorsPerQuorum,
            [0n]
        );
        expect(receipt).not.toBeNull();
        logger.info(`Updated stakes with tx hash: ${receipt.transactionHash}`);
    });

    test('updateSocket', async () => {
        const newSocket = '192.168.1.100:9000';
        const receipt = await client0.avsRegistryWriter.updateSocket(newSocket);
        expect(receipt).not.toBeNull();
        logger.info(`Updated socket with tx hash: ${receipt.transactionHash}`);
    });

    test('setAvs', async () => {
        const avsAddress = addresses.serviceManager;
        const receipt = await client0.avsRegistryWriter.setAvs(avsAddress);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set AVS with tx hash: ${receipt.transactionHash}`);
    });

    test('updateStakesOfOperatorSubsetForAllQuorums', async () => {
        const operators = [config.operator_address_1];
        const receipt = await client0.avsRegistryWriter.updateStakesOfOperatorSubsetForAllQuorums(operators);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Updated stakes for operator subset with tx hash: ${receipt.transactionHash}`);
    });

    test('setRewardsInitiator', async () => {
        const receipt = await client0.avsRegistryWriter.setRewardsInitiator(config.operator_address_1);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set rewards initiator with tx hash: ${receipt.transactionHash}`);
    });

    test('setMinimumStakeForQuorum', async () => {
        const quorumNumber = 0;
        const minimumStake = 1000000;
        const receipt = await client0.avsRegistryWriter.setMinimumStakeForQuorum(quorumNumber, minimumStake);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set minimum stake for quorum with tx hash: ${receipt.transactionHash}`);
    });

    test('createTotalDelegatedStakeQuorum', async () => {
        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 10n,
            kickBIPsOfOperatorStake: 10000n,
            kickBIPsOfTotalStake: 2000n,
        };
        const minimumStakeRequired = 1000000n;
        // const strategyAddr = client0.ethHttpClient.utils.toChecksumAddress(config.strategy_addr);
        const strategyParams: StrategyParams[] = [{
            strategy: addresses.erc20MockStrategy, multiplier: 10000n
        }];
        const receipt = await client0.avsRegistryWriter.createTotalDelegatedStakeQuorum(
            operatorSetParams,
            minimumStakeRequired,
            strategyParams
        );
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Created total delegated stake quorum with tx hash: ${receipt.transactionHash}`);
    });

    test('setOperatorSetParams', async () => {
        const quorumNumber = 0;
        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 10n,
            kickBIPsOfOperatorStake: 10000n,
            kickBIPsOfTotalStake: 2000n,
        };
        const receipt = await client0.avsRegistryWriter.setOperatorSetParams(quorumNumber, operatorSetParams);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set operator set params with tx hash: ${receipt.transactionHash}`);
    });

    test('setChurnApprover', async () => {
        const receipt = await client0.avsRegistryWriter.setChurnApprover(config.operator_address_1);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set churn approver with tx hash: ${receipt.transactionHash}`);
    });

    test('setEjector', async () => {
        const ejectorAddress = config.operator_address_1;
        const receipt = await client0.avsRegistryWriter.setEjector(ejectorAddress);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set ejector with tx hash: ${receipt.transactionHash}`);
    });

    test('modifyStrategyParams', async () => {
        const quorumNumber = 0;
        const strategyIndices = [0];
        const multipliers = [8000];
        const receipt = await client0.avsRegistryWriter.modifyStrategyParams(quorumNumber, strategyIndices, multipliers);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Modified strategy parameters with tx hash: ${receipt.transactionHash}`);
    });

    test('setEjectionCooldown', async () => {
        const ejectionCooldown = 100;
        const receipt = await client0.avsRegistryWriter.setEjectionCooldown(ejectionCooldown);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Set ejection cooldown with tx hash: ${receipt.transactionHash}`);
    });

    test('updateAvsMetadataUri', async () => {
        const metadataUri = 'https://example.com/avs-metadata-updated';
        const receipt = await client0.avsRegistryWriter.updateAvsMetadataUri(metadataUri);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Updated AVS metadata URI with tx hash: ${receipt.transactionHash}`);
    });

    test('createAvsRewardsSubmission', async () => {
        const strategyParams0 = await client0.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategyParams0).not.toBeNull();
        // const strategyAddr = client0.ethHttpClient.utils.toChecksumAddress(strategyParams.strategy);
        const duration = Number(await client0.elReader.getCalculationIntervalSeconds());
        const [, token] = await client0.elReader.getStrategyAndUnderlyingToken(strategyParams0.strategy);
        expect(token).not.toBeNull();
        const latestBlock = await client0.ethHttpClient.eth.getBlock('latest');
        const blockTime = Number(latestBlock.timestamp);
        const startTimestamp = Math.floor((blockTime / duration) + 1) * duration;
        const strategyParams: StrategyParams = { ...strategyParams0, multiplier: 1n };
        const rewardsSubmission: RewardsSubmission = {
            strategiesAndMultipliers: [strategyParams],
            token,
            amount: 1000n,
            startTimestamp: BigInt(startTimestamp),
            duration: BigInt(duration),
        };
        const receipt = await client0.avsRegistryWriter.createAvsRewardsSubmission([rewardsSubmission]);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1n);
        logger.info(`Created AVS rewards submission with tx hash: ${receipt.transactionHash}`);
    });

    test('createSlashableStakeQuorum', async () => {
        const deallocationDelay = await client0.elReader.getDeallocationDelay()
        expect(deallocationDelay).toBeGreaterThan(0n)

        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 10n,
            kickBIPsOfOperatorStake: 10000n,
            kickBIPsOfTotalStake: 2000n,
        };
        const minimumStakeRequired = 0n;
        const strategies = await client0.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategies).not.toBeNull();
        const strategyAddr = strategies.strategy;
        const strategyParam: StrategyParams = { strategy: strategyAddr, multiplier: 10000n };
        const lookAheadPeriod = 850n;
        try {
            const receipt = await client0.avsRegistryWriter.createSlashableStakeQuorum(
                operatorSetParams,
                minimumStakeRequired,
                [strategyParam],
                lookAheadPeriod
            );
            expect(receipt).not.toBeNull();
            logger.info(`Created slashable stake quorum with tx hash: ${receipt.transactionHash}`);
        }
        catch (e) {
            console.log(e)
            throw e
        }
    });

    test('setSlashableStakeLookahead', async () => {
        // operator set params
        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 5n,
            kickBIPsOfOperatorStake: 0n,
            kickBIPsOfTotalStake: 0n
        };

        const minimumStakeNeeded = 0n;

        // strategy params
        const strategyAddr = addresses.erc20MockStrategy;
        const strategyParam = {
            strategy: strategyAddr,
            multiplier: 1000000000000000000n, // 1e18
        };

        // default lookahead period = 0
        const lookAheadPeriod = 0n;

        // create quorum
        const receipt = await client0.avsRegistryWriter.createSlashableStakeQuorum(
            operatorSetParams,
            minimumStakeNeeded,
            [strategyParam],
            lookAheadPeriod,
        );
        expect(receipt.status).toBe(1n);
        // console.log(receipt);
        console.log(decodeTxReceiptLogs(receipt, Object.values(ABIs).flat()));

        // check lookAheadPeriod (expect 0 initially)
        let lookAhead = await client0.avsRegistryReader.getSlashableStakeLookAheadPerQuorum(1n);
        expect(lookAhead).toBe(0n);

        // set new lookAheadPeriod = 32
        const newQuorium = 3n;
        const newLookAheadPeriod = 32n;
        const receipt2 = await client0.avsRegistryWriter.setSlashableStakeLookahead(
            newQuorium,
            newLookAheadPeriod,
        );
        expect(receipt2.status).toBe(1n);

        // verify updated lookAheadPeriod
        lookAhead = await client0.avsRegistryReader.getSlashableStakeLookAheadPerQuorum(newQuorium);
        expect(lookAhead).toBe(newLookAheadPeriod);
    });

    test('addStrategies', async () => {
        const strategies = await client0.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategies).not.toBeNull();
        const strategyAddr = client0.ethHttpClient.utils.toChecksumAddress(strategies.strategy);
        const strategyParams: StrategyParams = { strategy: strategyAddr, multiplier: 10000n };
        try {
            await client0.avsRegistryWriter.addStrategies(0n, [strategyParams]);
            expect.fail('addStrategies with exesting strategy must not execute successfully');
        } catch (error) {
            expect(error).toHaveProperty('customMsg', 'InputDuplicateStrategy');
        }
    });

    test('ejectOperator', async () => {
        const address = config[`operator_address_1`];
        const receipt = await client0.avsRegistryWriter.ejectOperator(address, [0n]);
        expect(receipt).not.toBeNull();
        logger.info(`Ejected operator with tx hash: ${receipt.transactionHash}`);
    });

    test('removeStrategies', async () => {
        try {
            // add new strategy then delete it
            const newStrategy: StrategyParams = { strategy: config.avs_address, multiplier: 1000n }
            const addReceipt = await client0.avsRegistryWriter.addStrategies(0n, [newStrategy]);
            expect(addReceipt).not.toBeNull();

            const quorumNumber = 0n;
            const indicesToRemove = [1n];

            const receipt = await client0.avsRegistryWriter.removeStrategies(quorumNumber, indicesToRemove);
            expect(receipt).not.toBeNull();
            logger.info(`Removed strategies with tx hash: ${receipt.transactionHash}`);
        }
        catch (e: any) {
            console.error("removeStrategies", e);
            throw e;
        }
    });

    test('createOperatorDirectedAvsRewardsSubmission', async () => {
        try {
            const strategyParams0 = await client0.avsRegistryReader.strategyParamsByIndex(0n, 0n);
            expect(strategyParams0).not.toBeNull();
            // const strategyAddr = client0.ethHttpClient.utils.toChecksumAddress(strategies.strategy);
            const duration = Number(await client0.elReader.getCalculationIntervalSeconds());
            const [, token] = await client0.elReader.getStrategyAndUnderlyingToken(strategyParams0.strategy);
            expect(token).not.toBeNull();
            const latestBlock = await client0.ethHttpClient.eth.getBlock('latest');
            const blockTime = Number(latestBlock.timestamp);
            const startTimestamp = Math.floor((blockTime / duration) - 2) * duration;
            const strategyParams: StrategyParams = { ...strategyParams0, multiplier: 1n };
            const rewardsSubmission: OperatorDirectedRewardsSubmission = {
                strategiesAndMultipliers: [strategyParams],
                token,
                operatorRewards: [{ operator: config.operator_address_1, amount: 1000n }],
                startTimestamp: BigInt(startTimestamp),
                duration: BigInt(duration),
                description: 'Some Description',
            };
            const receipt = await client0.avsRegistryWriter.createOperatorDirectedAvsRewardsSubmission([rewardsSubmission]);
            expect(receipt).not.toBeNull();
            logger.info(`Created AVS rewards submission with tx hash: ${receipt.transactionHash}`);
        }
        catch (e) {
            console.log(e)
            throw e
        }
    });
});