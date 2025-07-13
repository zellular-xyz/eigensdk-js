import { Web3 } from 'web3';
import { clients, config } from '../builder.js';
import * as chainIoUtils from '../../chainio/utils.js'
import { describe, test, expect } from 'vitest';
import { OperatorSet, OperatorSetParams, SlashableStake } from '../../types/general.js';
import pino from 'pino';

const logger = pino({
    level: 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
    },
});

// Define TypeScript interfaces for Python types
// interface OperatorSet {
//     id: number;
//     avs: string;
//     quorumNumber?: number;
// }

interface AllocationInfo {
    OperatorSetId: number;
    AvsAddress: string;
    CurrentMagnitude: number;
    PendingDiff: number;
    EffectBlock: number;
}

interface SlashableShares {
    OperatorSet: OperatorSet;
    Strategies: string[];
    Operators: string[];
    SlashableStakes: number[];
}

describe('ELReader', () => {
    test('getAllocatableMagnitude', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const result = await clients.elReader.getAllocatableMagnitude(operatorAddr, strategyAddr);
        expect(typeof result).toBe('number');
        logger.info(`Allocatable magnitude: ${result}`);
    });

    test('getMaxMagnitudes', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddresses = [config.strategy_addr];
        const result = await clients.elReader.getMaxMagnitudes(operatorAddr, strategyAddresses);
        expect(Array.isArray(result)).toBe(true);
        expect(result.every(magnitude => typeof magnitude === 'number')).toBe(true);
        logger.info(`Max magnitudes: ${JSON.stringify(result)}`);
    });

    test('getAllocationInfo', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const result = await clients.elReader.getAllocationInfo(operatorAddr, strategyAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const allocation of result) {
            expect(typeof allocation).toBe('object');
            expect('OperatorSetId' in allocation).toBe(true);
            expect('AvsAddress' in allocation).toBe(true);
            expect('CurrentMagnitude' in allocation).toBe(true);
            expect('PendingDiff' in allocation).toBe(true);
            expect('EffectBlock' in allocation).toBe(true);
        }
        logger.info(`Allocation info: ${JSON.stringify(result)}`);
    });

    test('getOperatorShares', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddresses = [config.strategy_addr];
        const result = await clients.elReader.getOperatorShares(operatorAddr, strategyAddresses);
        expect(Array.isArray(result)).toBe(true);
        expect(result.every(share => typeof share === 'number')).toBe(true);
        logger.info(`Operator shares: ${JSON.stringify(result)}`);
    });

    test('getOperatorSetsForOperator', async () => {
        const operatorAddr = config.operator_address_1;
        const result = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const operatorSet of result) {
            expect(typeof operatorSet).toBe('object');
            expect('Id' in operatorSet).toBe(true);
            expect('Avs' in operatorSet).toBe(true);
        }
        logger.info(`Operator sets: ${JSON.stringify(result)}`);
    });

    test('getAllocationDelay', async () => {
        const operatorAddr = config.operator_address_1;
        const result = await clients.elReader.getAllocationDelay(operatorAddr);
        expect(typeof result).toBe('number');
        logger.info(`Allocation delay: ${result}`);
    });

    test('getRegisteredSets', async () => {
        const operatorAddr = config.operator_address_1;
        const result = await clients.elReader.getRegisteredSets(operatorAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const registeredSet of result) {
            expect(typeof registeredSet).toBe('object');
            expect('Id' in registeredSet).toBe(true);
            expect('Avs' in registeredSet).toBe(true);
        }
        logger.info(`Registered sets: ${JSON.stringify(result)}`);
    });

    test('isOperatorRegisteredWithAvs', async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = config.avs_address;
        const result = await clients.elReader.isOperatorRegisteredWithAvs(operatorAddr, avsAddr);
        expect(typeof result).toBe('boolean');
        logger.info(`Is operator registered with AVS: ${result}`);
    });

    test('isOperatorRegisteredWithOperatorSet', async () => {
        const operatorAddr = config.operator_address_1;
        const registeredSets = await clients.elReader.getRegisteredSets(operatorAddr);
        let operatorSet: OperatorSet;
        let expectedResult: boolean;
        if (registeredSets.length > 0) {
            operatorSet = registeredSets[0];
            expectedResult = true;
        } else {
            operatorSet = {
                id: 0n,
                avs: config.avs_registry_coordinator_address,
            };
            expectedResult = false;
        }
        const result = await clients.elReader.isOperatorRegisteredWithOperatorSet(operatorAddr, operatorSet);
        expect(typeof result).toBe('boolean');
        expect(result).toBe(expectedResult);
        logger.info(`Is operator registered with operator set: ${result} (Expected: ${expectedResult})`);
    });

    test('isOperatorSlashable', async () => {
        const operatorAddr = config.operator_address_1;
        const operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet = operatorSets.length > 0
            ? operatorSets[0]
            : { id: 0n, avs: config.avs_registry_coordinator_address };
        const result = await clients.elReader.isOperatorSlashable(operatorAddr, operatorSet);
        expect(typeof result).toBe('boolean');
        logger.info(`Is operator slashable: ${result}`);
    });

    test('getAllocatedStake', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet = operatorSets.length > 0
            ? operatorSets[0]
            : { id: 0n, avs: config.avs_registry_coordinator_address };
        const result = await clients.elReader.getAllocatedStake(operatorSet, [operatorAddr], [strategyAddr]);
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
            expect(result.every(innerList => Array.isArray(innerList))).toBe(true);
            for (const innerList of result) {
                expect(innerList.every(stake => typeof stake === 'number')).toBe(true);
            }
        }
        logger.info(`Allocated stake: ${JSON.stringify(result)}`);
    });

    test('getOperatorsForOperatorSet', async () => {
        const avsAddr = config.avs_address;
        const operatorSet: OperatorSet = { id: 1n, avs: avsAddr };
        const result = await clients.elReader.getOperatorsForOperatorSet(operatorSet);
        expect(Array.isArray(result)).toBe(true);
        for (const operator of result) {
            expect(clients.ethHttpClient.utils.isAddress(operator)).toBe(true);
        }
        logger.info(`Operators for operator set: ${JSON.stringify(result)}`);
    });

    test('getNumOperatorsForOperatorSet', async () => {
        const operatorAddr = config.operator_address_1;
        const operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet = operatorSets.length > 0
            ? operatorSets[0]
            : { id: 0n, avs: config.avs_registry_coordinator_address };
        const result = await clients.elReader.getNumOperatorsForOperatorSet(operatorSet);
        expect(typeof result).toBe('number');
        logger.info(`Number of operators for operator set: ${result}`);
    });

    test('getStrategiesForOperatorSet', async () => {
        const avsAddr = config.avs_address;
        const operatorSet: OperatorSet = { id: 1n, avs: avsAddr };
        const result = await clients.elReader.getStrategiesForOperatorSet(operatorSet);
        expect(Array.isArray(result)).toBe(true);
        for (const strategy of result) {
            expect(clients.ethHttpClient.utils.isAddress(strategy)).toBe(true);
        }
        logger.info(`Strategies for operator set: ${JSON.stringify(result)}`);
    });

    test('isOperatorRegistered', async () => {
        const operatorAddr = config.operator_address_1;
        const result = await clients.elReader.isOperatorRegistered(operatorAddr);
        expect(typeof result).toBe('boolean');
        logger.info(`Is operator registered: ${result}`);
    });

    // test('getStakerShares', async () => {
    //     const stakerAddr = config.operator_address_1;
    //     const [strategies, shares] = await clients.elReader.getStakerShares(stakerAddr);
    //     expect(Array.isArray(strategies)).toBe(true);
    //     expect(Array.isArray(shares)).toBe(true);
    //     expect(strategies.length).toBe(shares.length);
    //     for (const strategy of strategies) {
    //         expect(clients.ethHttpClient.utils.isAddress(strategy)).toBe(true);
    //     }
    //     for (const share of shares) {
    //         expect(typeof share).toBe('number');
    //     }
    //     logger.info(`Staker shares: strategies=${JSON.stringify(strategies)}, shares=${JSON.stringify(shares)}`);
    // });

    test('getAvsRegistrar', async () => {
        const avsAddr = config.avs_address;
        const result = await clients.elReader.getAvsRegistrar(avsAddr);
        expect(clients.ethHttpClient.utils.isAddress(result)).toBe(true);
        logger.info(`AVS registrar: ${result}`);
    });

    test('getDelegatedOperator', async () => {
        const stakerAddr = config.operator_address_1;
        const result = await clients.elReader.getDelegatedOperator(stakerAddr);
        expect(clients.ethHttpClient.utils.isAddress(result) || result === '0x0000000000000000000000000000000000000000').toBe(true);
        logger.info(`Delegated operator: ${result}`);
        const currentBlock = await clients.ethHttpClient.eth.getBlockNumber();
        const resultWithBlock = await clients.elReader.getDelegatedOperator(stakerAddr, currentBlock);
        expect(clients.ethHttpClient.utils.isAddress(resultWithBlock) || resultWithBlock === '0x0000000000000000000000000000000000000000').toBe(true);
        logger.info(`Delegated operator at block ${currentBlock}: ${resultWithBlock}`);
    });

    test('getOperatorDetails', async () => {
        const operatorAddr = config.operator_address_1;
        const operator = { address: operatorAddr };
        const result = await clients.elReader.getOperatorDetails(operator);
        expect(typeof result).toBe('object');
        expect('Address' in result).toBe(true);
        expect('DelegationApproverAddress' in result).toBe(true);
        expect('AllocationDelay' in result).toBe(true);
        expect(clients.ethHttpClient.utils.isAddress(result.Address)).toBe(true);
        expect(typeof result.AllocationDelay).toBe('number');
        logger.info(`Operator details: ${JSON.stringify(result)}`);
    });

    test('getOperatorSharesInStrategy', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const result = await clients.elReader.getOperatorSharesInStrategy(operatorAddr, strategyAddr);
        expect(typeof result).toBe('number');
        logger.info(`Operator shares in strategy: ${result}`);
    });

    test('calculateDelegationApprovalDigestHash', async () => {
        const stakerAddr = config.operator_address_1;
        const operatorAddr = config.operator_address_1;
        const delegationApprover = '0x0000000000000000000000000000000000000000';
        const approverSalt = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const expiry = 2 ** 32 - 1;
        const result = await clients.elReader.calculateDelegationApprovalDigestHash(
            stakerAddr,
            operatorAddr,
            delegationApprover,
            approverSalt,
            BigInt(expiry)
        );
        expect(typeof result).toBe('string');
        expect(result.length).toBe(66); // 0x + 32 bytes in hex
        expect(result.startsWith('0x')).toBe(true);
        logger.info(`Delegation approval digest hash: ${result}`);
    });

    test('getOperatorsShares', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const result = await clients.elReader.getOperatorsShares([operatorAddr], [strategyAddr]);
        expect(Array.isArray(result)).toBe(true);
        expect(result.every(innerList => Array.isArray(innerList))).toBe(true);
        for (const innerList of result) {
            expect(innerList.every(share => typeof share === 'number')).toBe(true);
        }
        logger.info(`Operators shares: ${JSON.stringify(result)}`);
    });

    test('getDelegationApproverSaltIsSpent', async () => {
        const delegationApprover = config.operator_address_1;
        const approverSalt = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getDelegationApproverSaltIsSpent(delegationApprover, approverSalt);
        expect(typeof result).toBe('boolean');
        logger.info(`Delegation approver salt is spent: ${result}`);
    });

    test('getPendingWithdrawalStatus', async () => {
        const withdrawalRoot = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getPendingWithdrawalStatus(withdrawalRoot);
        expect(typeof result).toBe('boolean');
        logger.info(`Pending withdrawal status: ${result}`);
    });

    test('getCumulativeWithdrawalsQueued', async () => {
        const stakerAddr = config.operator_address_1;
        const result = await clients.elReader.getCumulativeWithdrawalsQueued(stakerAddr);
        expect(typeof result).toBe('number');
        logger.info(`Cumulative withdrawals queued: ${result}`);
    });

    test('canCall', async () => {
        const accountAddr = config.operator_address_1;
        const appointeeAddr = config.operator_address_1;
        const targetAddr = config.avs_registry_coordinator_address;
        const selector = chainIoUtils.numsToBytes([12, 34, 56, 78]);
        const result = await clients.elReader.canCall(accountAddr, appointeeAddr, targetAddr, selector);
        expect(typeof result).toBe('boolean');
        logger.info(`Can call: ${result}`);
    });

    test('listAppointees', async () => {
        const accountAddr = config.operator_address_1;
        const targetAddr = config.avs_registry_coordinator_address;
        const selector = chainIoUtils.numsToBytes([12, 34, 56, 78]);
        const result = await clients.elReader.listAppointees(accountAddr, targetAddr, selector);
        expect(Array.isArray(result)).toBe(true);
        for (const appointee of result) {
            expect(clients.ethHttpClient.utils.isAddress(appointee)).toBe(true);
        }
        logger.info(`Appointees: ${JSON.stringify(result)}`);
    });

    test('listAppointeePermissions', async () => {
        const accountAddr = config.operator_address_1;
        const appointeeAddr = config.operator_address_1;
        const [targets, selectors] = await clients.elReader.listAppointeePermissions(accountAddr, appointeeAddr);
        expect(targets.length).toBe(selectors.length);
        for (const target of targets) {
            expect(clients.ethHttpClient.utils.isAddress(target)).toBe(true);
        }
        for (const selector of selectors) {
            expect(typeof selector).toBe('string');
            expect(selector.startsWith('0x')).toBe(true);
        }
        logger.info(`Appointee permissions: targets=${JSON.stringify(targets)}, selectors=[${selectors.map(s => s).join(', ')}]`);
    });

    test('listPendingAdmins', async () => {
        const accountAddr = config.operator_address_1;
        const result = await clients.elReader.listPendingAdmins(accountAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const admin of result) {
            expect(clients.ethHttpClient.utils.isAddress(admin)).toBe(true);
        }
        logger.info(`Pending admins: ${JSON.stringify(result)}`);
    });

    test('listAdmins', async () => {
        const accountAddr = config.operator_address_1;
        const result = await clients.elReader.listAdmins(accountAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const admin of result) {
            expect(clients.ethHttpClient.utils.isAddress(admin)).toBe(true);
        }
        logger.info(`Admins: ${JSON.stringify(result)}`);
    });

    test('isPendingAdmin', async () => {
        const accountAddr = config.operator_address_1;
        const pendingAdminAddr = config.operator_address_1;
        const result = await clients.elReader.isPendingAdmin(accountAddr, pendingAdminAddr);
        expect(typeof result).toBe('boolean');
        logger.info(`Is pending admin: ${result}`);
    });

    test('isAdmin', async () => {
        const accountAddr = config.operator_address_1;
        const adminAddr = config.operator_address_1;
        const result = await clients.elReader.isAdmin(accountAddr, adminAddr);
        expect(typeof result).toBe('boolean');
        logger.info(`Is admin: ${result}`);
    });

    test('getDistributionRootsLength', async () => {
        const result = await clients.elReader.getDistributionRootsLength();
        expect(typeof result).toBe('number');
        logger.info(`Distribution roots length: ${result}`);
    });

    test('getCurrRewardsCalculationEndTimestamp', async () => {
        const result = await clients.elReader.getCurrRewardsCalculationEndTimestamp();
        expect(typeof result).toBe('number');
        logger.info(`Current rewards calculation end timestamp: ${result}`);
    });

    test('getCurrentClaimableDistributionRoot', async () => {
        const result = await clients.elReader.getCurrentClaimableDistributionRoot();
        expect(typeof result).toBe('object');
        expect('root' in result).toBe(true);
        expect('startBlock' in result).toBe(true);
        expect('endBlock' in result).toBe(true);
        expect('totalClaimable' in result).toBe(true);
        logger.info(`Current claimable distribution root: ${JSON.stringify(result)}`);
    });

    test('getCumulativeClaimed', async () => {
        const earnerAddr = config.operator_address_1;
        const tokenAddr = config.strategy_addr;
        const result = await clients.elReader.getCumulativeClaimed(earnerAddr, tokenAddr);
        expect(typeof result).toBe('number');
        logger.info(`Cumulative claimed: ${result}`);
    });

    test('getOperatorAvsSplit', async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = config.avs_address;
        const result = await clients.elReader.getOperatorAvsSplit(operatorAddr, avsAddr);
        expect(typeof result).toBe('number');
        logger.info(`Operator AVS split: ${result}`);
    });

    test('getOperatorPiSplit', async () => {
        const operatorAddr = config.operator_address_1;
        const result = await clients.elReader.getOperatorPiSplit(operatorAddr);
        expect(typeof result).toBe('number');
        logger.info(`Operator PI split: ${result}`);
    });

    test('getOperatorSetSplit', async () => {
        const operatorAddr = config.operator_address_1;
        const operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet = operatorSets.length > 0
            ? operatorSets[0]
            : { id: 0n, avs: config.avs_registry_coordinator_address };
        const result = await clients.elReader.getOperatorSetSplit(operatorAddr, operatorSet);
        expect(typeof result).toBe('number');
        logger.info(`Operator set split: ${result}`);
    });

    test('getRewardsUpdater', async () => {
        const result = await clients.elReader.getRewardsUpdater();
        expect(clients.ethHttpClient.utils.isAddress(result)).toBe(true);
        logger.info(`Rewards updater: ${result}`);
    });

    test('getDefaultOperatorSplitBips', async () => {
        const result = await clients.elReader.getDefaultOperatorSplitBips();
        expect(typeof result).toBe('number');
        logger.info(`Default operator split bips: ${result}`);
    });

    test('getClaimerFor', async () => {
        const earnerAddr = config.operator_address_1;
        const result = await clients.elReader.getClaimerFor(earnerAddr);
        expect(clients.ethHttpClient.utils.isAddress(result)).toBe(true);
        logger.info(`Claimer for ${earnerAddr}: ${result}`);
    });

    test('getSubmissionNonce', async () => {
        const avsAddr = config.avs_address;
        const result = await clients.elReader.getSubmissionNonce(avsAddr);
        expect(typeof result).toBe('number');
        logger.info(`Submission nonce: ${result}`);
    });

    test('getIsAvsRewardsSubmissionHash', async () => {
        const avsAddr = config.avs_address;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getIsAvsRewardsSubmissionHash(avsAddr, hashValue);
        expect(typeof result).toBe('boolean');
        logger.info(`Is AVS rewards submission hash: ${result}`);
    });

    test('getIsRewardsSubmissionForAllHash', async () => {
        const avsAddr = config.avs_address;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getIsRewardsSubmissionForAllHash(avsAddr, hashValue);
        expect(typeof result).toBe('boolean');
        logger.info(`Is rewards submission for all hash: ${result}`);
    });

    test('getIsRewardsForAllSubmitter', async () => {
        const submitterAddr = config.operator_address_1;
        const result = await clients.elReader.getIsRewardsForAllSubmitter(submitterAddr);
        expect(typeof result).toBe('boolean');
        logger.info(`Is rewards for all submitter: ${result}`);
    });

    test('getIsRewardsSubmissionForAllEarnersHash', async () => {
        const avsAddr = config.avs_address;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getIsRewardsSubmissionForAllEarnersHash(avsAddr, hashValue);
        expect(typeof result).toBe('boolean');
        logger.info(`Is rewards submission for all earners hash: ${result}`);
    });

    test('getIsOperatorDirectedAvsRewardsSubmissionHash', async () => {
        const avsAddr = config.avs_address;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getIsOperatorDirectedAvsRewardsSubmissionHash(avsAddr, hashValue);
        expect(typeof result).toBe('boolean');
        logger.info(`Is operator directed AVS rewards submission hash: ${result}`);
    });

    test('getIsOperatorDirectedOperatorSetRewardsSubmissionHash', async () => {
        const avsAddr = config.avs_address;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await clients.elReader.getIsOperatorDirectedOperatorSetRewardsSubmissionHash(avsAddr, hashValue);
        expect(typeof result).toBe('boolean');
        logger.info(`Is operator directed operator set rewards submission hash: ${result}`);
    });

    test('getStrategyAndUnderlyingToken', async () => {
        const strategyAddr = config.strategy_addr;
        const [strategyContract, tokenAddr] = await clients.elReader.getStrategyAndUnderlyingToken(strategyAddr);
        expect(clients.ethHttpClient.utils.isAddress(tokenAddr)).toBe(true);
        logger.info(`Strategy and underlying token: contract=${strategyContract.options.address}, token_addr=${tokenAddr}`);
    });

    test('getStrategyAndUnderlyingErc20Token', async () => {
        const strategyAddr = config.strategy_addr;
        const [strategyContract, tokenContract, tokenAddr] = await clients.elReader.getStrategyAndUnderlyingErc20Token(strategyAddr);
        expect(clients.ethHttpClient.utils.isAddress(tokenAddr)).toBe(true);
        logger.info(`Strategy and underlying ERC20 token: token_addr=${tokenAddr}, token_contract=${tokenContract.options.address}, strategy_contract=${strategyContract.options.address}`);
    });

    test('calculateOperatorAvsRegistrationDigestHash', async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = config.avs_address;
        const salt = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const expiry = 2 ** 32 - 1;
        // @ts-ignore
        const result: string = await clients.elReader.calculateOperatorAvsRegistrationDigestHash(operatorAddr, avsAddr, salt, BigInt(expiry));
        expect(typeof result).toBe('string');
        expect(result.length).toBe(66);
        expect(result.startsWith('0x')).toBe(true);
        logger.info(`Operator AVS registration digest hash: ${result}`);
    });

    test('getEncumberedMagnitude', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const result = await clients.elReader.getEncumberedMagnitude(operatorAddr, strategyAddr);
        expect(typeof result).toBe('number');
        logger.info(`Encumbered magnitude: ${result}`);
    });

    test('getCalculationIntervalSeconds', async () => {
        const result = await clients.elReader.getCalculationIntervalSeconds();
        expect(typeof result).toBe('number');
        logger.info(`Calculation interval seconds: ${result}`);
    });

    test('getMaxRewardsDuration', async () => {
        const result = await clients.elReader.getMaxRewardsDuration();
        expect(typeof result).toBe('number');
        logger.info(`Max rewards duration: ${result}`);
    });

    test('getMaxRetroactiveLength', async () => {
        const result = await clients.elReader.getMaxRetroactiveLength();
        expect(typeof result).toBe('number');
        logger.info(`Max retroactive length: ${result}`);
    });

    test('getMaxFutureLength', async () => {
        const result = await clients.elReader.getMaxFutureLength();
        expect(typeof result).toBe('number');
        logger.info(`Max future length: ${result}`);
    });

    test('getGenesisRewardsTimestamp', async () => {
        const result = await clients.elReader.getGenesisRewardsTimestamp();
        expect(typeof result).toBe('number');
        logger.info(`Genesis rewards timestamp: ${result}`);
    });

    test('getActivationDelay', async () => {
        const result = await clients.elReader.getActivationDelay();
        expect(typeof result).toBe('number');
        logger.info(`Activation delay: ${result}`);
    });

    test('getDeallocationDelay', async () => {
        const result = await clients.elReader.getDeallocationDelay();
        expect(typeof result).toBe('number');
        logger.info(`Deallocation delay: ${result}`);
    });

    test('getAllocationConfigurationDelay', async () => {
        const result = await clients.elReader.getAllocationConfigurationDelay();
        expect(typeof result).toBe('number');
        logger.info(`Allocation configuration delay: ${result}`);
    });

    test('getNumOperatorSetsForOperator', async () => {
        const operatorAddr = config.operator_address_1;
        const result = await clients.elReader.getNumOperatorSetsForOperator(operatorAddr);
        expect(typeof result).toBe('number');
        logger.info(`Number of operator sets for operator: ${result}`);
    });

    test('getSlashableShares', async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = config.strategy_addr;
        const operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet = operatorSets.length > 0
            ? operatorSets[0]
            : { id: 0n, avs: config.avs_registry_coordinator_address };
        const result = await clients.elReader.getSlashableShares(operatorAddr, operatorSet, [strategyAddr]);
        expect(Array.isArray(result)).toBe(true);
        logger.info(`Slashable shares: ${JSON.stringify(result)}`);
    });

    test('getSlashableSharesForOperatorSetsBefore', async () => {
        const operatorAddr = config.operator_address_1;
        let operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        if (!operatorSets.length) {
            operatorSets = [{ id: 1n, avs: config.avs_registry_coordinator_address }];
        }
        const currentBlock = await clients.ethHttpClient.eth.getBlockNumber();
        const result = await clients.elReader.getSlashableSharesForOperatorSetsBefore(operatorSets, currentBlock);
        expect(Array.isArray(result)).toBe(true);
        logger.info(`Slashable shares for operator sets before: ${JSON.stringify(result)}`);
    });

    test('getSlashableSharesForOperatorSets', async () => {
        const operatorAddr = config.operator_address_1;
        let operatorSets = await clients.elReader.getOperatorSetsForOperator(operatorAddr);
        if (!operatorSets.length) {
            operatorSets = [{ id: 1n, avs: config.avs_registry_coordinator_address }];
        }
        const result: SlashableStake[] | null = await clients.elReader.getSlashableSharesForOperatorSets(operatorSets);
        expect(Array.isArray(result)).toBe(true);
        for (const item of result || []) {
            expect(typeof item).toBe('object');
            expect('OperatorSet' in item).toBe(true);
            expect('Strategies' in item).toBe(true);
            expect('Operators' in item).toBe(true);
            expect('SlashableStakes' in item).toBe(true);
            const operatorSet = item.operatorSet;
            expect(typeof operatorSet).toBe('object');
            expect('id' in operatorSet).toBe(true);
            expect('avs' in operatorSet).toBe(true);
            expect(typeof operatorSet.id).toBe('number');
            expect(clients.ethHttpClient.utils.isAddress(operatorSet.avs)).toBe(true);
            expect(Array.isArray(item.strategies)).toBe(true);
            expect(Array.isArray(item.operators)).toBe(true);
            expect(Array.isArray(item.slashableStakes)).toBe(true);
            for (const strategy of item.strategies) {
                expect(clients.ethHttpClient.utils.isAddress(strategy)).toBe(true);
            }
            for (const operator of item.operators) {
                expect(clients.ethHttpClient.utils.isAddress(operator)).toBe(true);
            }
            for (const stake of item.slashableStakes) {
                expect(typeof stake).toBe('number');
            }
        }
        logger.info(`Slashable shares for operator sets: ${JSON.stringify(result)}`);
    });
});