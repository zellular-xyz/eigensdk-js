import { Web3 } from 'web3';
import { clients, config } from '../builder';
import { AvsRegistryReader } from '../../chainio/clients/avsregistry/reader';
import { describe, test, expect, beforeAll } from 'vitest';
import { G1Point } from '../../crypto/bls/attestation';
import { 
    BlockNumber,
    ApkUpdate, 
    OperatorStateRetrieverCheckSignaturesIndices, 
    OperatorStateRetrieverOperator, 
    StakeUpdate, 
    StrategyParams, 
    Uint32,
    Uint96
} from '../../types/general';


const quorumNumbers = [0n];

describe('AvsRegistryReader', () => {
    let operatorId: string;

    beforeAll(async () => {
        const result = await clients.avsRegistryReader.getOperatorsStakeInQuorumsAtCurrentBlock(quorumNumbers);
        operatorId = result[0][0].operatorId;
    });

    test('getQuorumCount', async () => {
        const quorumCount = await clients.avsRegistryReader.getQuorumCount();
        expect(typeof quorumCount).toBe('number');
        console.log(`Quorum count: ${quorumCount}`);
    });

    test('getOperatorsStakeInQuorumsAtCurrentBlock', async () => {
        const result = await clients.avsRegistryReader.getOperatorsStakeInQuorumsAtCurrentBlock(quorumNumbers);
        expect(Array.isArray(result)).toBe(true);
        for (const quorumOperators of result) {
            expect(Array.isArray(quorumOperators)).toBe(true);
            expect(quorumOperators.every((op: OperatorStateRetrieverOperator) => 
                typeof op.operatorId === 'string' && typeof op.stake === 'number'
            )).toBe(true);
        }
        console.log(`Operators stake in quorums at current block: ${JSON.stringify(result)}`);
    });

    test('getOperatorsStakeInQuorumsAtBlock', async () => {
        const blockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        const result = await clients.avsRegistryReader.getOperatorsStakeInQuorumsAtBlock(quorumNumbers, blockNumber);
        expect(Array.isArray(result)).toBe(true);
        for (const quorumOperators of result) {
            expect(Array.isArray(quorumOperators)).toBe(true);
            expect(quorumOperators.every((op: OperatorStateRetrieverOperator) => 
                typeof op.operatorId === 'string' && typeof op.stake === 'number'
            )).toBe(true);
        }
        console.log(`Operators stake in quorums at block ${blockNumber}: ${JSON.stringify(result)}`);
    });

    test('getOperatorAddrsInQuorumsAtCurrentBlock', async () => {
        const result = await clients.avsRegistryReader.getOperatorAddrsInQuorumsAtCurrentBlock(quorumNumbers);
        expect(Array.isArray(result)).toBe(true);
        for (const addresses of result) {
            expect(Array.isArray(addresses)).toBe(true);
            expect(addresses.every((addr: string) => typeof addr === 'string')).toBe(true);
        }
        console.log(`Operator addresses in quorums at current block: ${JSON.stringify(result)}`);
    });

    test('getOperatorsStakeInQuorumsOfOperatorAtBlockForNonRegisteredOperator', async () => {
        const operatorId = '0x' + '0'.repeat(64);
        const blockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        await expect(
            clients.avsRegistryReader.getOperatorsStakeInQuorumsOfOperatorAtBlock(operatorId, blockNumber)
        ).rejects.toThrow();
    });

    test('getSingleOperatorStakeInQuorumsOfOperatorAtCurrentBlock', async () => {
        const result = await clients.avsRegistryReader.getOperatorStakeInQuorumsOfOperatorAtCurrentBlock(operatorId);
        expect(typeof result === 'object').toBe(true);
        expect(Object.keys(result).every(key => typeof parseInt(key) === 'number')).toBe(true);
        expect(Object.values(result).every((stake: any) => typeof stake === 'number')).toBe(true);
        console.log(`Single operator stakes in quorums at current block: ${JSON.stringify(result)}`);
    });

    test('getSingleOperatorStakeInQuorumsOfOperatorAtCurrentBlockForNonRegisteredOperator', async () => {
        const operatorId = '0x' + '0'.repeat(64);
        const result = await clients.avsRegistryReader.getOperatorStakeInQuorumsOfOperatorAtCurrentBlock(operatorId);
        expect(typeof result === 'object').toBe(true);
        expect(Object.keys(result).length).toBe(0);
    });

    test('getOperatorsStakeInQuorumsOfOperatorAtBlock', async () => {
        const blockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        const result = await clients.avsRegistryReader.getOperatorsStakeInQuorumsOfOperatorAtBlock(operatorId, blockNumber);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
        const [quorumIdsResult, stakesResult] = result;
        expect(Array.isArray(quorumIdsResult)).toBe(true);
        expect(quorumIdsResult.every((qid: number) => typeof qid === 'number')).toBe(true);
        expect(Array.isArray(stakesResult)).toBe(true);
        expect(stakesResult.every((stakeList: OperatorStateRetrieverOperator[]) => 
            Array.isArray(stakeList) && stakeList.every(op => typeof op.operatorId === 'string' && typeof op.stake === 'number')
        )).toBe(true);
        console.log(`Operator ID: ${operatorId} → Quorum IDs: ${JSON.stringify(quorumIdsResult)}`);
        console.log(`Stakes at block ${blockNumber}: ${JSON.stringify(stakesResult)}`);
    });

    test('weightOfOperatorForQuorum', async () => {
        const quorumNumber = 0n;
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const result = await clients.avsRegistryReader.weightOfOperatorForQuorum(quorumNumber, operatorAddr);
        expect(typeof result).toBe('number');
        console.log(`Weight of operator ${operatorAddr} for quorum ${quorumNumber}: ${result}`);
    });

    test('strategyParamsLength', async () => {
        const quorumNumber = 0n;
        const result = await clients.avsRegistryReader.strategyParamsLength(quorumNumber);
        expect(typeof result).toBe('number');
        console.log(`Strategy params length for quorum ${quorumNumber}: ${result}`);
    });

    test('strategyParamsByIndex', async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const result = await clients.avsRegistryReader.strategyParamsByIndex(quorumNumber, index);
        expect(typeof result === 'object' && 'strategy' in result && 'multiplier' in result).toBe(true);
        console.log(`Strategy params for quorum ${quorumNumber} at index ${index}: ${JSON.stringify(result)}`);
    });

    test('getStakeHistoryLength', async () => {
        const quorumNumber = 0n;
        const stakeHistoryLength = await clients.avsRegistryReader.getStakeHistoryLength(operatorId, quorumNumber);
        expect(typeof stakeHistoryLength).toBe('bigint');
        expect(stakeHistoryLength).toBeGreaterThanOrEqual(0);
        console.log(`Stake history length for operator ${operatorId} in quorum ${quorumNumber}: ${stakeHistoryLength}`);
    });

    test('getStakeHistory', async () => {
        const quorumNumber = 0n;
        const stakeHistory = await clients.avsRegistryReader.getStakeHistory(operatorId, quorumNumber);
        expect(Array.isArray(stakeHistory)).toBe(true);
        expect(stakeHistory.every((update: StakeUpdate) => 
            typeof update.updateBlockNumber === 'bigint' && typeof update.stake === 'bigint'
        )).toBe(true);
        console.log(`Stake history for operator ${operatorId} in quorum ${quorumNumber}: ${JSON.stringify(stakeHistory)}`);
    });

    test('getLatestStakeUpdate', async () => {
        const quorumNumber = 0n;
        const latestUpdate = await clients.avsRegistryReader.getLatestStakeUpdate(operatorId, quorumNumber);
        expect(typeof latestUpdate === 'object' && 'blockNumber' in latestUpdate && 'stake' in latestUpdate).toBe(true);
        console.log(`Last stake update for operator ${operatorId} in quorum ${quorumNumber}: ${JSON.stringify(latestUpdate)}`);
    });

    test('getStakeUpdateAtIndex', async () => {
        const quorumNumber = 0n;
        const historyLength = await clients.avsRegistryReader.getStakeHistoryLength(operatorId, quorumNumber);
        expect(typeof historyLength).toBe('bigint');
        expect(historyLength).toBeGreaterThan(0);
        const index = historyLength - 1n;
        const stakeUpdate = await clients.avsRegistryReader.getStakeUpdateAtIndex(operatorId, quorumNumber, index);
        expect(typeof stakeUpdate === 'object' && 'blockNumber' in stakeUpdate && 'stake' in stakeUpdate).toBe(true);
        console.log(`Stake update at index ${index} for operator ${operatorId} in quorum ${quorumNumber}: ${JSON.stringify(stakeUpdate)}`);
    });

    test('getStakeAtBlockNumber', async () => {
        const quorumNumber = 0n;
        const blockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        const stake = await clients.avsRegistryReader.getStakeAtBlockNumber(operatorId, quorumNumber, blockNumber);
        expect(typeof stake).toBe('number');
        expect(stake).toBeGreaterThanOrEqual(0);
        console.log(`Stake at block ${blockNumber} for operator ${operatorId} in quorum ${quorumNumber}: ${stake}`);
    });

    test('getStakeUpdateIndexAtBlockNumber', async () => {
        const quorumNumber = 0n;
        const blockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        const index = await clients.avsRegistryReader.getStakeUpdateIndexAtBlockNumber(operatorId, quorumNumber, blockNumber);
        expect(typeof index).toBe('number');
        expect(index).toBeGreaterThanOrEqual(0);
        console.log(`Stake update index for operator ${operatorId} in quorum ${quorumNumber} at block ${blockNumber}: ${index}`);
    });

    test('getTotalStakeHistoryLength', async () => {
        const quorumNumber = 0n;
        const totalLength = await clients.avsRegistryReader.getTotalStakeHistoryLength(quorumNumber);
        expect(typeof totalLength).toBe('number');
        expect(totalLength).toBeGreaterThanOrEqual(0);
        console.log(`Total stake history length for quorum ${quorumNumber}: ${totalLength}`);
    });

    test('getCheckSignaturesIndices', async () => {
        const referenceBlockNumber = (await clients.ethHttpClient.eth.getBlockNumber()) - 1n;
        const nonSignerOperatorIds = [operatorId];
        const result = await clients.avsRegistryReader.getCheckSignaturesIndices(referenceBlockNumber, quorumNumbers, nonSignerOperatorIds);
        expect(typeof result === 'object' && 'indices' in result).toBe(true);
        console.log(`Check Signatures Indices result at block ${referenceBlockNumber}: ${JSON.stringify(result)}`);
    });

    test('getCurrentTotalStake', async () => {
        const quorumNumber = 0n;
        const totalStake = await clients.avsRegistryReader.getCurrentTotalStake(quorumNumber);
        expect(typeof totalStake).toBe('number');
        expect(totalStake).toBeGreaterThanOrEqual(0);
        console.log(`Current total stake for quorum ${quorumNumber}: ${totalStake}`);
    });

    test('getTotalStakeUpdateAtIndex', async () => {
        const quorumNumber = 0n;
        const totalLength = await clients.avsRegistryReader.getTotalStakeHistoryLength(quorumNumber);
        expect(typeof totalLength).toBe('number');
        expect(totalLength).toBeGreaterThan(0);
        const index = totalLength - 1n;
        const update = await clients.avsRegistryReader.getTotalStakeUpdateAtIndex(quorumNumber, index);
        expect(typeof update === 'object' && 'blockNumber' in update && 'stake' in update).toBe(true);
        console.log(`Total stake update for quorum ${quorumNumber} at index ${index}: ${JSON.stringify(update)}`);
    });

    test('getTotalStakeAtBlockNumberFromIndex', async () => {
        const quorumNumber = 0n;
        const blockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        const index = 0n;
        const result = await clients.avsRegistryReader.getTotalStakeAtBlockNumberFromIndex(quorumNumber, blockNumber, index);
        expect(typeof result).toBe('number');
        console.log(`Total stake for quorum ${quorumNumber} at block ${blockNumber} from index ${index}: ${result}`);
    });

    test('getTotalStakeIndicesAtBlockNumber', async () => {
        const blockNumber: BlockNumber = await clients.ethHttpClient.eth.getBlockNumber();
        const indices: Uint32[] = await clients.avsRegistryReader.getTotalStakeIndicesAtBlockNumber(quorumNumbers, blockNumber);
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.every((i: Uint32) => typeof i === 'bigint')).toBe(true);
        console.log(`Total stake indices at block ${blockNumber} for quorums ${JSON.stringify(quorumNumbers)}: ${JSON.stringify(indices)}`);
    });

    test('getMinimumStakeForQuorum', async () => {
        const quorumNumber = 0n;
        const result: Uint96 = await clients.avsRegistryReader.getMinimumStakeForQuorum(quorumNumber);
        expect(typeof result).toBe('bigint');
        console.log(`Minimum stake for quorum ${quorumNumber}: ${result}`);
    });

    test('getStrategyParamsAtIndex', async () => {
        const quorumNumber = 0n;
        const totalStakeStrategyCount = await clients.avsRegistryReader.getTotalStakeHistoryLength(quorumNumber);
        expect(totalStakeStrategyCount).toBeGreaterThanOrEqual(1);
        const index = totalStakeStrategyCount - 1n;
        const strategyParam = await clients.avsRegistryReader.getStrategyParamsAtIndex(quorumNumber, index);
        expect(strategyParam).toBeDefined();
    });

    test('getStrategyPerQuorumAtIndex', async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const result = await clients.avsRegistryReader.getStrategyPerQuorumAtIndex(quorumNumber, index);
        expect(typeof result).toBe('string');
        console.log(`Strategy for quorum ${quorumNumber} at index ${index}: ${result}`);
    });

    test('getStakeTypePerQuorum', async () => {
        const quorumNumber = 0n;
        const stakeType = await clients.avsRegistryReader.getStakeTypePerQuorum(quorumNumber);
        expect(typeof stakeType).toBe('number');
        expect(stakeType).toBeGreaterThanOrEqual(0);
        expect(stakeType).toBeLessThanOrEqual(255);
        console.log(`Stake type for quorum ${quorumNumber}: ${stakeType}`);
    });

    test('getSlashableStakeLookAheadPerQuorum', async () => {
        const quorumNumber = 0n;
        const lookahead = await clients.avsRegistryReader.getSlashableStakeLookAheadPerQuorum(quorumNumber);
        expect(typeof lookahead).toBe('number');
        expect(lookahead).toBeGreaterThanOrEqual(0);
        console.log(`Slashable stake lookahead for quorum ${quorumNumber}: ${lookahead}`);
    });

    test('getOperatorId', async () => {
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const result = await clients.avsRegistryReader.getOperatorId(operatorAddr);
        expect(typeof result).toBe('string');
        console.log(`Operator ID for ${operatorAddr}: ${result}`);
    });

    test('getOperatorIdForNonRegisteredOperator', async () => {
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress('0x1234567890123456789012345678901234567890');
        const result = await clients.avsRegistryReader.getOperatorId(operatorAddr);
        expect(typeof result).toBe('string');
        expect(result).toBe('0x' + '0'.repeat(64));
        console.log(`Operator ID for ${operatorAddr}: ${result}`);
    });

    test('getOperatorFromId', async () => {
        const address = await clients.avsRegistryReader.getOperatorFromId(operatorId);
        expect(clients.ethHttpClient.utils.isAddress(address)).toBe(true);
        console.log(`Operator ID ${operatorId} maps to address: ${address}`);
    });

    test('queryRegistrationDetail', async () => {
        const operator = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const result = await clients.avsRegistryReader.queryRegistrationDetail(operator);
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((x: boolean) => typeof x === 'boolean')).toBe(true);
        console.log(`Quorum participation bitmap for operator ${operator}: ${JSON.stringify(result)}`);
    });

    test('getOperatorAddressFromOperatorId', async () => {
        const result = await clients.avsRegistryReader.getOperatorAddressFromOperatorId(operatorId);
        expect(typeof result).toBe('string');
        console.log(`Operator address from operator ID ${operatorId}: ${result}`);
    });

    test('getPubkeyFromOperatorAddress', async () => {
        const operatorAddr = clients.ethHttpClient.utils.toChecksumAddress(config.operator_address_1);
        const result = await clients.avsRegistryReader.getPubkeyFromOperatorAddress(operatorAddr);
        expect(typeof result === 'object' && 'x' in result && 'y' in result).toBe(true);
        console.log(`Public key for operator ${operatorAddr}: ${JSON.stringify(result)}`);
    });

    test('getApkUpdate', async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const update = await clients.avsRegistryReader.getApkUpdate(quorumNumber, index);
        expect(typeof update === 'object' && 'apk' in update && 'blockNumber' in update).toBe(true);
        console.log(`APK Update for quorum ${quorumNumber}, index ${index}: ${JSON.stringify(update)}`);
    });

    test('getCurrentApk', async () => {
        const quorumNumber = 0n;
        const apk = await clients.avsRegistryReader.getCurrentApk(quorumNumber);
        expect(typeof apk === 'object' && 'x' in apk && 'y' in apk && typeof apk.getStr === 'function').toBe(true);
        console.log(`Current APK for quorum ${quorumNumber}: ${apk.getStr()}`);
    });

    test('queryExistingRegisteredOperatorSockets', async () => {
        const [result, stopBlock] = await clients.avsRegistryReader.queryExistingRegisteredOperatorSockets();
        expect(typeof result === 'object').toBe(true);
        expect(typeof stopBlock).toBe('number');
        for (const [operatorId, socket] of Object.entries(result)) {
            expect(typeof operatorId).toBe('string');
            expect(typeof socket).toBe('string');
        }
        console.log(`Found ${Object.keys(result).length} registered operator sockets up to block ${stopBlock}`);
    });

    test('queryExistingRegisteredOperatorPubkeys', async () => {
        const [operatorAddresses, operatorPubkeys] = await clients.avsRegistryReader.queryExistingRegisteredOperatorPubkeys();
        expect(Array.isArray(operatorAddresses)).toBe(true);
        expect(Array.isArray(operatorPubkeys)).toBe(true);
        expect(operatorAddresses.length).toBe(operatorPubkeys.length);
        for (let i = 0; i < operatorAddresses.length; i++) {
            expect(typeof operatorAddresses[i]).toBe('string');
            expect(typeof operatorPubkeys[i] === 'object' && 'g1Pubkey' in operatorPubkeys[i]).toBe(true);
        }
        console.log(`Found ${operatorAddresses.length} registered operator public keys`);
    });

    test('registryCoordinatorOwner', async () => {
        const owner = await clients.avsRegistryReader.getRegistryCoordinatorOwner();
        expect(clients.ethHttpClient.utils.isAddress(owner)).toBe(true);
        console.log(`RegistryCoordinator owner: ${owner}`);
        const isOwner = await clients.avsRegistryReader.isRegistryCoordinatorOwner(owner);
        expect(isOwner).toBe(true);
        const testAddress = clients.ethHttpClient.utils.toChecksumAddress('0x1234567890123456789012345678901234567890');
        const canSatisfy = await clients.avsRegistryReader.canSatisfyOnlyCoordinatorOwnerModifier(testAddress);
        expect(canSatisfy).toBe(false);
        console.log(`Can address ${testAddress} satisfy onlyCoordinatorOwner modifier? ${canSatisfy}`);
    });
});