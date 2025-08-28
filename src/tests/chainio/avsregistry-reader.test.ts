import { Web3 } from "web3";
import { buildClients, config } from "../builder.js";
import { AvsRegistryReader } from "../../chainio/clients/avsregistry/reader";
import { describe, test, expect, beforeAll } from "vitest";
import {
    G1Point,
    KeyPair,
    init as attestationInit,
} from "../../crypto/bls/attestation";
import {
    BlockNumber,
    ApkUpdate,
    OperatorStateRetrieverCheckSignaturesIndices,
    OperatorStateRetrieverOperator,
    StakeUpdate,
    StrategyParams,
    Uint32,
    Uint96,
    ContractAddresses,
} from "../../types/general";
import { Clients } from "../../chainio/clients/builder.js";
import * as testUtils from "../utils/anvil.js";
import { jsonEncode } from "../../utils/helpers.js";

function isStakeUpdate(obj: any): boolean {
    return (
        typeof obj === "object" &&
        ["updateBlockNumber", "nextUpdateBlockNumber", "stake"].every(
            (i) => i in obj,
        )
    );
}

describe.sequential("AvsRegistryReader", () => {
    let clients: Clients[];
    let addresses: ContractAddresses;
    let client0: Clients;
    let operatorId: string;

    beforeAll(async () => {
        await attestationInit();

        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(
            testConfigs.anvilStateFileName,
        );

        ({ clients, addresses } = await buildClients(endpoint));
        client0 = clients[0];

        // initialize
        await client0.elWriter.registerForOperatorSets(
            addresses.registryCoordinator,
            {
                operatorAddress: config.operator_address_1,
                avsAddress: addresses.serviceManager,
                operatorSetIds: [0n],
                socket: "operator-socket",
                blsKeyPair: new KeyPair(),
            },
        );
        await client0.avsRegistryWriter.updateStakesOfEntireOperatorSetForQuorums(
            [[config.operator_address_1]],
            [0n],
        );

        const result =
            await client0.avsRegistryReader.getOperatorsStakeInQuorumsAtCurrentBlock(
                [0n],
            );
        operatorId = result[0][0].operatorId;
    });

    test("getQuorumCount", async () => {
        const quorumCount = await client0.avsRegistryReader.getQuorumCount();
        expect(typeof quorumCount).toBe("bigint");
        console.log(`Quorum count: ${quorumCount}`);
    });

    test("getOperatorsStakeInQuorumsAtCurrentBlock", async () => {
        const result =
            await client0.avsRegistryReader.getOperatorsStakeInQuorumsAtCurrentBlock(
                [0n],
            );
        expect(Array.isArray(result)).toBe(true);
        for (const quorumOperators of result) {
            expect(Array.isArray(quorumOperators)).toBe(true);
            expect(
                quorumOperators.every(
                    (op: OperatorStateRetrieverOperator) =>
                        typeof op.operatorId === "string" &&
                        typeof op.stake === "bigint",
                ),
            ).toBe(true);
        }
        console.log(
            `Operators stake in quorums at current block: ${jsonEncode(result)}`,
        );
    });

    test("getOperatorsStakeInQuorumsAtBlock", async () => {
        const blockNumber = await client0.ethHttpClient.eth.getBlockNumber();
        const result =
            await client0.avsRegistryReader.getOperatorsStakeInQuorumsAtBlock(
                [0n],
                blockNumber,
            );
        expect(Array.isArray(result)).toBe(true);
        for (const quorumOperators of result) {
            expect(Array.isArray(quorumOperators)).toBe(true);
            expect(
                quorumOperators.every(
                    (op: OperatorStateRetrieverOperator) =>
                        typeof op.operatorId === "string" &&
                        typeof op.stake === "bigint",
                ),
            ).toBe(true);
        }
        console.log(
            `Operators stake in quorums at block ${blockNumber}: ${jsonEncode(result)}`,
        );
    });

    test("getOperatorAddrsInQuorumsAtCurrentBlock", async () => {
        const result =
            await client0.avsRegistryReader.getOperatorAddrsInQuorumsAtCurrentBlock(
                [0n],
            );
        expect(Array.isArray(result)).toBe(true);
        for (const addresses of result) {
            expect(Array.isArray(addresses)).toBe(true);
            expect(
                addresses.every((addr: string) => typeof addr === "string"),
            ).toBe(true);
        }
        console.log(
            `Operator addresses in quorums at current block: ${jsonEncode(result)}`,
        );
    });

    test("getOperatorsStakeInQuorumsOfOperatorAtBlockForNonRegisteredOperator", async () => {
        const operatorId = "0x" + "0".repeat(64);
        const blockNumber = await client0.ethHttpClient.eth.getBlockNumber();
        await expect(
            client0.avsRegistryReader.getOperatorsStakeInQuorumsOfOperatorAtBlock(
                operatorId,
                blockNumber,
            ),
        ).rejects.toThrow();
    });

    test("getSingleOperatorStakeInQuorumsOfOperatorAtCurrentBlock", async () => {
        const result =
            await client0.avsRegistryReader.getOperatorStakeInQuorumsOfOperatorAtCurrentBlock(
                operatorId,
            );
        expect(typeof result === "object").toBe(true);
        expect(
            Object.keys(result).every(
                (key) => typeof parseInt(key) === "number",
            ),
        ).toBe(true);
        expect(
            Object.values(result).every(
                (stake: any) => typeof stake === "bigint",
            ),
        ).toBe(true);
        console.log(
            `Single operator stakes in quorums at current block: ${jsonEncode(result)}`,
        );
    });

    test("getSingleOperatorStakeInQuorumsOfOperatorAtCurrentBlockForNonRegisteredOperator", async () => {
        const operatorId = "0x" + "0".repeat(64);
        const result =
            await client0.avsRegistryReader.getOperatorStakeInQuorumsOfOperatorAtCurrentBlock(
                operatorId,
            );
        expect(typeof result === "object").toBe(true);
        expect(Object.keys(result).length).toBe(0);
    });

    test("getOperatorsStakeInQuorumsOfOperatorAtBlock", async () => {
        const blockNumber = await client0.ethHttpClient.eth.getBlockNumber();
        const result =
            await client0.avsRegistryReader.getOperatorsStakeInQuorumsOfOperatorAtBlock(
                operatorId,
                blockNumber,
            );
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
        const [quorumIdsResult, stakesResult] = result;
        expect(Array.isArray(quorumIdsResult)).toBe(true);
        expect(
            quorumIdsResult.every((qid: number) => typeof qid === "bigint"),
        ).toBe(true);
        expect(Array.isArray(stakesResult)).toBe(true);
        expect(
            stakesResult.every(
                (stakeList: OperatorStateRetrieverOperator[]) =>
                    Array.isArray(stakeList) &&
                    stakeList.every(
                        (op) =>
                            typeof op.operatorId === "string" &&
                            typeof op.stake === "bigint",
                    ),
            ),
        ).toBe(true);
        console.log(
            `Operator ID: ${operatorId} → Quorum IDs: ${jsonEncode(quorumIdsResult)}`,
        );
        console.log(
            `Stakes at block ${blockNumber}: ${jsonEncode(stakesResult)}`,
        );
    });

    test("weightOfOperatorForQuorum", async () => {
        const quorumNumber = 0n;
        const operatorAddr = config.operator_address_1;
        const result =
            await client0.avsRegistryReader.weightOfOperatorForQuorum(
                quorumNumber,
                operatorAddr,
            );
        expect(typeof result).toBe("bigint");
        console.log(
            `Weight of operator ${operatorAddr} for quorum ${quorumNumber}: ${result}`,
        );
    });

    test("strategyParamsLength", async () => {
        const quorumNumber = 0n;
        const result =
            await client0.avsRegistryReader.strategyParamsLength(quorumNumber);
        expect(typeof result).toBe("bigint");
        console.log(
            `Strategy params length for quorum ${quorumNumber}: ${result}`,
        );
    });

    test("strategyParamsByIndex", async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const result = await client0.avsRegistryReader.strategyParamsByIndex(
            quorumNumber,
            index,
        );
        expect(
            typeof result === "object" &&
                "strategy" in result &&
                "multiplier" in result,
        ).toBe(true);
        console.log(
            `Strategy params for quorum ${quorumNumber} at index ${index}: ${jsonEncode(result)}`,
        );
    });

    test("getStakeHistoryLength", async () => {
        const quorumNumber = 0n;
        const stakeHistoryLength =
            await client0.avsRegistryReader.getStakeHistoryLength(
                operatorId,
                quorumNumber,
            );
        expect(typeof stakeHistoryLength).toBe("bigint");
        expect(stakeHistoryLength).toBeGreaterThanOrEqual(0n);
        console.log(
            `Stake history length for operator ${operatorId} in quorum ${quorumNumber}: ${stakeHistoryLength}`,
        );
    });

    test("getStakeHistory", async () => {
        const quorumNumber = 0n;
        const stakeHistory = await client0.avsRegistryReader.getStakeHistory(
            operatorId,
            quorumNumber,
        );
        expect(Array.isArray(stakeHistory)).toBe(true);
        expect(
            stakeHistory.every(
                (update: StakeUpdate) =>
                    typeof update.updateBlockNumber === "bigint" &&
                    typeof update.stake === "bigint",
            ),
        ).toBe(true);
        console.log(
            `Stake history for operator ${operatorId} in quorum ${quorumNumber}: ${jsonEncode(stakeHistory)}`,
        );
    });

    test("getLatestStakeUpdate", async () => {
        const quorumNumber = 0n;
        const latestUpdate =
            await client0.avsRegistryReader.getLatestStakeUpdate(
                operatorId,
                quorumNumber,
            );
        expect(isStakeUpdate(latestUpdate)).toBe(true);
        console.log(
            `Last stake update for operator ${operatorId} in quorum ${quorumNumber}: ${jsonEncode(latestUpdate)}`,
        );
    });

    test("getStakeUpdateAtIndex", async () => {
        const quorumNumber = 0n;
        const historyLength =
            await client0.avsRegistryReader.getStakeHistoryLength(
                operatorId,
                quorumNumber,
            );
        expect(typeof historyLength).toBe("bigint");
        expect(historyLength).toBeGreaterThan(0);
        const index = historyLength - 1n;
        const stakeUpdate =
            await client0.avsRegistryReader.getStakeUpdateAtIndex(
                operatorId,
                quorumNumber,
                index,
            );
        expect(isStakeUpdate(stakeUpdate)).toBe(true);
        console.log(
            `Stake update at index ${index} for operator ${operatorId} in quorum ${quorumNumber}: ${jsonEncode(stakeUpdate)}`,
        );
    });

    test("getStakeAtBlockNumber", async () => {
        const quorumNumber = 0n;
        const blockNumber = await client0.ethHttpClient.eth.getBlockNumber();
        const stake = await client0.avsRegistryReader.getStakeAtBlockNumber(
            operatorId,
            quorumNumber,
            blockNumber,
        );
        expect(typeof stake).toBe("bigint");
        expect(stake).toBeGreaterThanOrEqual(0);
        console.log(
            `Stake at block ${blockNumber} for operator ${operatorId} in quorum ${quorumNumber}: ${stake}`,
        );
    });

    test("getStakeUpdateIndexAtBlockNumber", async () => {
        const quorumNumber = 0n;
        const blockNumber = await client0.ethHttpClient.eth.getBlockNumber();
        const index =
            await client0.avsRegistryReader.getStakeUpdateIndexAtBlockNumber(
                operatorId,
                quorumNumber,
                blockNumber,
            );
        expect(typeof index).toBe("bigint");
        expect(index).toBeGreaterThanOrEqual(0n);
        console.log(
            `Stake update index for operator ${operatorId} in quorum ${quorumNumber} at block ${blockNumber}: ${index}`,
        );
    });

    test("getTotalStakeHistoryLength", async () => {
        const quorumNumber = 0n;
        const totalLength =
            await client0.avsRegistryReader.getTotalStakeHistoryLength(
                quorumNumber,
            );
        expect(typeof totalLength).toBe("bigint");
        expect(totalLength).toBeGreaterThanOrEqual(0n);
        console.log(
            `Total stake history length for quorum ${quorumNumber}: ${totalLength}`,
        );
    });

    test("getCheckSignaturesIndices", async () => {
        const referenceBlockNumber =
            (await client0.ethHttpClient.eth.getBlockNumber()) - 1n;
        const nonSignerOperatorIds = [operatorId];
        const result =
            await client0.avsRegistryReader.getCheckSignaturesIndices(
                referenceBlockNumber,
                [0n],
                nonSignerOperatorIds,
            );
        expect(
            typeof result === "object" &&
                [
                    "nonSignerQuorumBitmapIndices",
                    "quorumApkIndices",
                    "totalStakeIndices",
                    "nonSignerStakeIndices",
                ].every((i) => i in result),
        ).toBe(true);
        console.log(
            `Check Signatures Indices result at block ${referenceBlockNumber}: ${jsonEncode(result)}`,
        );
    });

    test("getCurrentTotalStake", async () => {
        const quorumNumber = 0n;
        const totalStake =
            await client0.avsRegistryReader.getCurrentTotalStake(quorumNumber);
        expect(typeof totalStake).toBe("bigint");
        expect(totalStake).toBeGreaterThanOrEqual(0n);
        console.log(
            `Current total stake for quorum ${quorumNumber}: ${totalStake}`,
        );
    });

    test("getTotalStakeUpdateAtIndex", async () => {
        const quorumNumber = 0n;
        const totalLength =
            await client0.avsRegistryReader.getTotalStakeHistoryLength(
                quorumNumber,
            );
        expect(typeof totalLength).toBe("bigint");
        expect(totalLength).toBeGreaterThan(0n);
        const index = totalLength - 1n;
        const update =
            await client0.avsRegistryReader.getTotalStakeUpdateAtIndex(
                quorumNumber,
                index,
            );
        expect(isStakeUpdate(update)).toBe(true);
        console.log(
            `Total stake update for quorum ${quorumNumber} at index ${index}: ${jsonEncode(update)}`,
        );
    });

    test("getTotalStakeAtBlockNumberFromIndex", async () => {
        const quorumNumber = 0n;
        const blockNumber = await client0.ethHttpClient.eth.getBlockNumber();
        const index = 1n;

        const latestUpdate =
            await client0.avsRegistryReader.getLatestStakeUpdate(
                operatorId,
                quorumNumber,
            );
        const actualStake = latestUpdate.stake;
        const updateBlockNumber = latestUpdate.updateBlockNumber;

        const totalStakeUpdateAtIndex =
            await client0.avsRegistryReader.getTotalStakeAtBlockNumberFromIndex(
                quorumNumber,
                updateBlockNumber,
                index,
            );
        expect(actualStake).toEqual(totalStakeUpdateAtIndex);
        console.log(
            `Total stake for quorum ${quorumNumber} at block ${blockNumber} from index ${index}: ${totalStakeUpdateAtIndex}`,
        );
    });

    test("getTotalStakeIndicesAtBlockNumber", async () => {
        const blockNumber: BlockNumber =
            await client0.ethHttpClient.eth.getBlockNumber();
        const indices: Uint32[] =
            await client0.avsRegistryReader.getTotalStakeIndicesAtBlockNumber(
                [0n],
                blockNumber,
            );
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.every((i: Uint32) => typeof i === "bigint")).toBe(true);
        console.log(
            `Total stake indices at block ${blockNumber} for quorums ${jsonEncode([0n])}: ${jsonEncode(indices)}`,
        );
    });

    test("getMinimumStakeForQuorum", async () => {
        const quorumNumber = 0n;
        const result: Uint96 =
            await client0.avsRegistryReader.getMinimumStakeForQuorum(
                quorumNumber,
            );
        expect(typeof result).toBe("bigint");
        console.log(`Minimum stake for quorum ${quorumNumber}: ${result}`);
    });

    test("getStrategyParamsAtIndex", async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const strategyParam =
            await client0.avsRegistryReader.getStrategyParamsAtIndex(
                quorumNumber,
                index,
            );
        expect(strategyParam).toBeDefined();
    });

    test("getStrategyPerQuorumAtIndex", async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const result =
            await client0.avsRegistryReader.getStrategyPerQuorumAtIndex(
                quorumNumber,
                index,
            );
        expect(typeof result).toBe("string");
        console.log(
            `Strategy for quorum ${quorumNumber} at index ${index}: ${result}`,
        );
    });

    test("getStakeTypePerQuorum", async () => {
        const quorumNumber = 0n;
        const stakeType =
            await client0.avsRegistryReader.getStakeTypePerQuorum(quorumNumber);
        expect(typeof stakeType).toBe("bigint");
        expect(stakeType).toBeGreaterThanOrEqual(0n);
        expect(stakeType).toBeLessThanOrEqual(255n);
        console.log(`Stake type for quorum ${quorumNumber}: ${stakeType}`);
    });

    test("getSlashableStakeLookAheadPerQuorum", async () => {
        const quorumNumber = 0n;
        const lookahead =
            await client0.avsRegistryReader.getSlashableStakeLookAheadPerQuorum(
                quorumNumber,
            );
        expect(typeof lookahead).toBe("bigint");
        expect(lookahead).toBeGreaterThanOrEqual(0n);
        console.log(
            `Slashable stake lookahead for quorum ${quorumNumber}: ${lookahead}`,
        );
    });

    test("getOperatorId", async () => {
        const operatorAddr = config.operator_address_1;
        const result =
            await client0.avsRegistryReader.getOperatorId(operatorAddr);
        expect(typeof result).toBe("string");
        console.log(`Operator ID for ${operatorAddr}: ${result}`);
    });

    test("getOperatorIdForNonRegisteredOperator", async () => {
        const operatorAddr = "0x1234567890123456789012345678901234567890";
        const result =
            await client0.avsRegistryReader.getOperatorId(operatorAddr);
        expect(typeof result).toBe("string");
        expect(result).toBe("0x" + "0".repeat(64));
        console.log(`Operator ID for ${operatorAddr}: ${result}`);
    });

    test("getOperatorFromId", async () => {
        const address =
            await client0.avsRegistryReader.getOperatorFromId(operatorId);
        expect(client0.ethHttpClient.utils.isAddress(address)).toBe(true);
        console.log(`Operator ID ${operatorId} maps to address: ${address}`);
    });

    test("queryRegistrationDetail", async () => {
        const operator = config.operator_address_1;
        const result =
            await client0.avsRegistryReader.queryRegistrationDetail(operator);
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((x: boolean) => typeof x === "boolean")).toBe(true);
        console.log(
            `Quorum participation bitmap for operator ${operator}: ${jsonEncode(result)}`,
        );
    });

    test("getOperatorAddressFromOperatorId", async () => {
        const result =
            await client0.avsRegistryReader.getOperatorAddressFromOperatorId(
                operatorId,
            );
        expect(typeof result).toBe("string");
        console.log(
            `Operator address from operator ID ${operatorId}: ${result}`,
        );
    });

    test("getPubkeyFromOperatorAddress", async () => {
        const operatorAddr = config.operator_address_1;
        const result: G1Point =
            await client0.avsRegistryReader.getPubkeyFromOperatorAddress(
                operatorAddr,
            );
        expect(typeof result === "object" && result instanceof G1Point).toBe(
            true,
        );
        console.log(
            `Public key for operator ${operatorAddr}: ${jsonEncode(result)}`,
        );
    });

    test("getApkUpdate", async () => {
        const quorumNumber = 0n;
        const index = 0n;
        const update = await client0.avsRegistryReader.getApkUpdate(
            quorumNumber,
            index,
        );
        expect(
            typeof update === "object" &&
                "apkHash" in update &&
                "updateBlockNumber" in update &&
                "nextUpdateBlockNumber" in update,
        ).toBe(true);
        // TODO: does it need to check apkHash not to be ADDRESS_ZERO
        console.log(
            `APK Update for quorum ${quorumNumber}, index ${index}: ${jsonEncode(update)}`,
        );
    });

    test("getCurrentApk", async () => {
        const quorumNumber = 0n;
        const apk: G1Point =
            await client0.avsRegistryReader.getCurrentApk(quorumNumber);
        expect(
            typeof apk === "object" &&
                apk instanceof G1Point &&
                typeof apk.getStr === "function",
        ).toBe(true);
        console.log(`Current APK for quorum ${quorumNumber}: ${apk.getStr()}`);
    });

    test("queryExistingRegisteredOperatorSockets", async () => {
        const [result, stopBlock] =
            await client0.avsRegistryReader.queryExistingRegisteredOperatorSockets();
        expect(typeof result === "object").toBe(true);
        expect(typeof stopBlock).toBe("bigint");
        for (const [operatorId, socket] of Object.entries(result)) {
            expect(typeof operatorId).toBe("string");
            expect(typeof socket).toBe("string");
        }
        console.log(
            `Found ${Object.keys(result).length} registered operator sockets up to block ${stopBlock}`,
        );
    });

    test("queryExistingRegisteredOperatorPubkeys", async () => {
        const [operatorAddresses, operatorPubkeys] =
            await client0.avsRegistryReader.queryExistingRegisteredOperatorPubkeys();
        expect(Array.isArray(operatorAddresses)).toBe(true);
        expect(Array.isArray(operatorPubkeys)).toBe(true);
        expect(operatorAddresses.length).toBe(operatorPubkeys.length);
        for (let i = 0; i < operatorAddresses.length; i++) {
            expect(typeof operatorAddresses[i]).toBe("string");
            expect(
                typeof operatorPubkeys[i] === "object" &&
                    "g1PubKey" in operatorPubkeys[i],
            ).toBe(true);
        }
        console.log(
            `Found ${operatorAddresses.length} registered operator public keys`,
        );
    });

    test("registryCoordinatorOwner", async () => {
        const owner =
            await client0.avsRegistryReader.getRegistryCoordinatorOwner();
        expect(client0.ethHttpClient.utils.isAddress(owner)).toBe(true);
        console.log(`RegistryCoordinator owner: ${owner}`);
        const isOwner =
            await client0.avsRegistryReader.isRegistryCoordinatorOwner(owner);
        expect(isOwner).toBe(true);
        const testAddress = client0.ethHttpClient.utils.toChecksumAddress(
            "0x1234567890123456789012345678901234567890",
        );
        const canSatisfy =
            await client0.avsRegistryReader.canSatisfyOnlyCoordinatorOwnerModifier(
                testAddress,
            );
        expect(canSatisfy).toBe(false);
        console.log(
            `Can address ${testAddress} satisfy onlyCoordinatorOwner modifier? ${canSatisfy}`,
        );
    });
});
