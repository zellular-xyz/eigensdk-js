import { Web3 } from 'web3';
import { clients, clientsArray, config } from '../builder.js';
import { describe, test, expect } from 'vitest';
import { G1Point, KeyPair } from '../../crypto/bls/attestation.js';
import { Operator, OperatorSetParams, RewardsSubmission, OperatorDirectedRewardsSubmission, StrategyParams } from '../../types/general.js';
import pino from 'pino';

const logger = pino({
    level: 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
    },
});

const quorumNumbers = [0n];

describe('AvsRegistryWriter', () => {
    test('registerAsOperatorForOperatorSets', async () => {
        for (let i = 0; i < 3; i++) {
            // @ts-ignore
            const address = clientsArray[i].ethHttpClient.utils.toChecksumAddress(config[`operator_address_${i + 1}`]);
            const operator: Operator = {
                address,
                earningsReceiverAddress: address,
                delegationApproverAddress: clientsArray[i].ethHttpClient.utils.toChecksumAddress('0x0000000000000000000000000000000000000000'),
                allocationDelay: 50n,
                metadataUrl: 'https://example.com/operator-metadata',
                stakerOptOutWindowBlocks: 100n,
            };
            const receipt = await clientsArray[i].elWriter.registerAsOperator(operator);
            expect(receipt).not.toBeNull();
            expect(receipt.status).toBe(1);
            logger.info(`Registered operator with tx hash: ${receipt.transactionHash}`);

            const setReceipt = await clientsArray[i].elWriter.registerForOperatorSets(
                config.avs_registry_coordinator_address,
                {
                    operatorAddress: address,
                    avsAddress: config.service_manager_address,
                    operatorSetIds: [0n],
                    socket: 'operator-socket',
                    blsKeyPair: new KeyPair(),
                }
            );
            expect(setReceipt.status).toBe(1);
            logger.info(`Registered for operator sets with tx hash: ${setReceipt.transactionHash}`);
        }
    });

    test('updateStakesOfEntireOperatorSetForQuorums', async () => {
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_2);
        const operatorsPerQuorum = [[operatorAddr]];
        const receipt = await clients.avsRegistryWriter.updateStakesOfEntireOperatorSetForQuorums(
            operatorsPerQuorum,
            quorumNumbers
        );
        expect(receipt).not.toBeNull();
        logger.info(`Updated stakes with tx hash: ${receipt.transactionHash}`);
    });

    test('updateSocket', async () => {
        const newSocket = '192.168.1.100:9000';
        const receipt = await clients.avsRegistryWriter.updateSocket(newSocket);
        expect(receipt).not.toBeNull();
        logger.info(`Updated socket with tx hash: ${receipt.transactionHash}`);
    });

    test('setAvs', async () => {
        const avsAddress = clients.ethHttpClient.utils.toChecksumAddress(config.service_manager_address);
        const receipt = await clients.avsRegistryWriter.setAvs(avsAddress);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set AVS with tx hash: ${receipt.transactionHash}`);
    });

    test('updateStakesOfOperatorSubsetForAllQuorums', async () => {
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const operators = [operatorAddr];
        const receipt = await clients.avsRegistryWriter.updateStakesOfOperatorSubsetForAllQuorums(operators);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Updated stakes for operator subset with tx hash: ${receipt.transactionHash}`);
    });

    test('setRewardsInitiator', async () => {
        const rewardsInitiatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const receipt = await clients.avsRegistryWriter.setRewardsInitiator(rewardsInitiatorAddr);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set rewards initiator with tx hash: ${receipt.transactionHash}`);
    });

    test('setMinimumStakeForQuorum', async () => {
        const quorumNumber = 0;
        const minimumStake = 1000000;
        const receipt = await clients.avsRegistryWriter.setMinimumStakeForQuorum(quorumNumber, minimumStake);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set minimum stake for quorum with tx hash: ${receipt.transactionHash}`);
    });

    test('createTotalDelegatedStakeQuorum', async () => {
        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 10n,
            kickBIPsOfOperatorStake: 10000n,
            kickBIPsOfTotalStake: 2000n,
        };
        const minimumStakeRequired = 1000000n;
        const strategyAddr = clients.ethHttpClient.utils.toChecksumAddress(config.strategy_addr);
        const strategyParams: StrategyParams[] = [{ strategy: strategyAddr, multiplier: 10000n }];
        const receipt = await clients.avsRegistryWriter.createTotalDelegatedStakeQuorum(
            operatorSetParams,
            minimumStakeRequired,
            strategyParams
        );
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Created total delegated stake quorum with tx hash: ${receipt.transactionHash}`);
    });

    test('setOperatorSetParams', async () => {
        const quorumNumber = 0;
        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 10n,
            kickBIPsOfOperatorStake: 10000n,
            kickBIPsOfTotalStake: 2000n,
        };
        const receipt = await clients.avsRegistryWriter.setOperatorSetParams(quorumNumber, operatorSetParams);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set operator set params with tx hash: ${receipt.transactionHash}`);
    });

    test('setChurnApprover', async () => {
        const churnApproverAddress = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const receipt = await clients.avsRegistryWriter.setChurnApprover(churnApproverAddress);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set churn approver with tx hash: ${receipt.transactionHash}`);
    });

    test('setEjector', async () => {
        const ejectorAddress = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const receipt = await clients.avsRegistryWriter.setEjector(ejectorAddress);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set ejector with tx hash: ${receipt.transactionHash}`);
    });

    test('modifyStrategyParams', async () => {
        const quorumNumber = 0;
        const strategyIndices = [0];
        const multipliers = [8000];
        const receipt = await clients.avsRegistryWriter.modifyStrategyParams(quorumNumber, strategyIndices, multipliers);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Modified strategy parameters with tx hash: ${receipt.transactionHash}`);
    });

    test('setEjectionCooldown', async () => {
        const ejectionCooldown = 100;
        const receipt = await clients.avsRegistryWriter.setEjectionCooldown(ejectionCooldown);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Set ejection cooldown with tx hash: ${receipt.transactionHash}`);
    });

    test('updateAvsMetadataUri', async () => {
        const metadataUri = 'https://example.com/avs-metadata-updated';
        const receipt = await clients.avsRegistryWriter.updateAvsMetadataUri(metadataUri);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Updated AVS metadata URI with tx hash: ${receipt.transactionHash}`);
    });

    test('createAvsRewardsSubmission', async () => {
        const strategyParams0 = await clients.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategyParams0).not.toBeNull();
        // const strategyAddr = clients.ethHttpClient.utils.toChecksumAddress(strategyParams.strategy);
        const duration = Number(await clients.elReader.getCalculationIntervalSeconds());
        const [, token] = await clients.elReader.getStrategyAndUnderlyingToken(strategyParams0.strategy);
        expect(token).not.toBeNull();
        const latestBlock = await clients.ethHttpClient.eth.getBlock('latest');
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
        const receipt = await clients.avsRegistryWriter.createAvsRewardsSubmission([rewardsSubmission]);
        expect(receipt).not.toBeNull();
        expect(receipt.status).toBe(1);
        logger.info(`Created AVS rewards submission with tx hash: ${receipt.transactionHash}`);
    });

    test('createSlashableStakeQuorum', async () => {
        const operatorSetParams: OperatorSetParams = {
            maxOperatorCount: 1000n,
            kickBIPsOfOperatorStake: 10000n,
            kickBIPsOfTotalStake: 2000n,
        };
        const minimumStakeRequired = 0n;
        const strategies = await clients.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategies).not.toBeNull();
        const strategyAddr = clients.ethHttpClient.utils.toChecksumAddress(strategies.strategy);
        const strategyParam: StrategyParams = { strategy: strategyAddr, multiplier: 10000n };
        const lookAheadPeriod = 50400n;
        const receipt = await clients.avsRegistryWriter.createSlashableStakeQuorum(
            operatorSetParams,
            minimumStakeRequired,
            [strategyParam],
            lookAheadPeriod
        );
        expect(receipt).not.toBeNull();
        logger.info(`Created slashable stake quorum with tx hash: ${receipt.transactionHash}`);
    });

    test('setSlashableStakeLookahead', async () => {
        const quorumNumber = 0;
        const lookAheadPeriod = 50400;
        const receipt = await clients.avsRegistryWriter.setSlashableStakeLookahead(quorumNumber, lookAheadPeriod);
        expect(receipt).not.toBeNull();
        if (receipt.status === 1) {
            logger.info(`Set slashable stake lookahead with tx hash: ${receipt.transactionHash}`);
        } else {
            logger.info('Quorum is not Slashable Stake Quorum');
        }
    });

    test('addStrategies', async () => {
        const strategies = await clients.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategies).not.toBeNull();
        const strategyAddr = clients.ethHttpClient.utils.toChecksumAddress(strategies.strategy);
        const strategyParams: StrategyParams = { strategy: strategyAddr, multiplier: 10000n };
        const receipt = await clients.avsRegistryWriter.addStrategies(0, [strategyParams]);
        expect(receipt).not.toBeNull();
        logger.info(`Added strategies with tx hash: ${receipt.transactionHash}`);
    });

    test('ejectOperator', async () => {
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const receipt = await clients.avsRegistryWriter.ejectOperator(operatorAddr, quorumNumbers);
        expect(receipt).not.toBeNull();
        logger.info(`Ejected operator with tx hash: ${receipt.transactionHash}`);
    });

    test('removeStrategies', async () => {
        const quorumNumber = 0;
        const indicesToRemove = [1];
        const receipt = await clients.avsRegistryWriter.removeStrategies(quorumNumber, indicesToRemove);
        expect(receipt).not.toBeNull();
        logger.info(`Removed strategies with tx hash: ${receipt.transactionHash}`);
    });

    test('createOperatorDirectedAvsRewardsSubmission', async () => {
        const strategyParams0 = await clients.avsRegistryReader.strategyParamsByIndex(0n, 0n);
        expect(strategyParams0).not.toBeNull();
        // const strategyAddr = clients.ethHttpClient.utils.toChecksumAddress(strategies.strategy);
        const duration = Number(await clients.elReader.getCalculationIntervalSeconds());
        const [, token] = await clients.elReader.getStrategyAndUnderlyingToken(strategyParams0.strategy);
        expect(token).not.toBeNull();
        const latestBlock = await clients.ethHttpClient.eth.getBlock('latest');
        const blockTime = Number(latestBlock.timestamp);
        const startTimestamp = Math.floor((blockTime / duration) + 1) * duration;
        const strategyParams: StrategyParams = { ...strategyParams0, multiplier: 1n };
        const rewardsSubmission: OperatorDirectedRewardsSubmission = {
            strategiesAndMultipliers: [strategyParams],
            token,
            operatorRewards: [{ operator: config.operator_address_1, amount: 1000n }],
            startTimestamp: BigInt(startTimestamp),
            duration: BigInt(duration),
            description: 'Some Description',
        };
        const receipt = await clients.avsRegistryWriter.createOperatorDirectedAvsRewardsSubmission([rewardsSubmission]);
        expect(receipt).not.toBeNull();
        logger.info(`Created AVS rewards submission with tx hash: ${receipt.transactionHash}`);
    });
});