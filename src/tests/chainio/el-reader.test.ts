import { Bytes, Web3 } from "web3";
import { buildClients, config } from "../builder.js";
import * as chainIoUtils from "../../chainio/utils.js";
import * as testUtils from "../utils/anvil.js";
import { describe, test, expect, beforeAll } from "vitest";
import { init as attestationInit } from "../../crypto/bls/attestation.js";
import {
    ContractAddresses,
    OperatorSet,
    OperatorSetParams,
    SlashableStake,
} from "../../types/general.js";
import { Clients } from "../../chainio/clients/builder.js";
import pino from "pino";
import { jsonEncode } from "../../utils/helpers.js";
import { expectToHaveProps, isObject } from "../utils/test-utils.js";

const logger = pino({
    level: "silent", // Set log level here
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            sync: true, // Ensure pino-pretty is synchronous
        },
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

describe("ELReader", () => {
    let clients: Clients[];
    let addresses: ContractAddresses;
    let client0: Clients;

    beforeAll(async () => {
        await attestationInit();

        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(
            testConfigs.anvilStateFileName,
        );

        ({ clients, addresses } = await buildClients(endpoint));
        client0 = clients[0];
    });

    test("getAllocatableMagnitude", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const result = await client0.elReader.getAllocatableMagnitude(
            operatorAddr,
            strategyAddr,
        );
        expect(typeof result).toBe("bigint");
        logger.info(`Allocatable magnitude: ${result}`);
    });

    test("getMaxMagnitudes", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddresses = [addresses.erc20MockStrategy];
        const result = await client0.elReader.getMaxMagnitudes(
            operatorAddr,
            strategyAddresses,
        );
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((magnitude) => typeof magnitude === "bigint")).toBe(
            true,
        );
        logger.info(`Max magnitudes: ${jsonEncode(result)}`);
    });

    test("getAllocationInfo", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const result = await client0.elReader.getAllocationInfo(
            operatorAddr,
            strategyAddr,
        );
        expect(Array.isArray(result)).toBe(true);
        for (const allocation of result) {
            expect(typeof allocation).toBe("object");
            expect("OperatorSetId" in allocation).toBe(true);
            expect("AvsAddress" in allocation).toBe(true);
            expect("CurrentMagnitude" in allocation).toBe(true);
            expect("PendingDiff" in allocation).toBe(true);
            expect("EffectBlock" in allocation).toBe(true);
        }
        logger.info(`Allocation info: ${jsonEncode(result)}`);
    });

    test("getOperatorShares", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddresses = [addresses.erc20MockStrategy];
        const result = await client0.elReader.getOperatorShares(
            operatorAddr,
            strategyAddresses,
        );
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((share) => typeof share === "bigint")).toBe(true);
        logger.info(`Operator shares: ${jsonEncode(result)}`);
    });

    test("getOperatorSetsForOperator", async () => {
        const operatorAddr = config.operator_address_1;
        const result =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const operatorSet of result) {
            expect(typeof operatorSet).toBe("object");
            expect("Id" in operatorSet).toBe(true);
            expect("Avs" in operatorSet).toBe(true);
        }
        logger.info(`Operator sets: ${jsonEncode(result)}`);
    });

    test("getAllocationDelay", async () => {
        const operatorAddr = config.operator_address_1;
        const result = await client0.elReader.getAllocationDelay(operatorAddr);
        expect(typeof result).toBe("bigint");
        logger.info(`Allocation delay: ${result}`);
    });

    test("getRegisteredSets", async () => {
        const operatorAddr = config.operator_address_1;
        const result = await client0.elReader.getRegisteredSets(operatorAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const registeredSet of result) {
            expect(typeof registeredSet).toBe("object");
            expect("Id" in registeredSet).toBe(true);
            expect("Avs" in registeredSet).toBe(true);
        }
        logger.info(`Registered sets: ${jsonEncode(result)}`);
    });

    test("isOperatorRegisteredWithAvs", async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = addresses.avsAddress;
        const result = await client0.elReader.isOperatorRegisteredWithAvs(
            operatorAddr,
            avsAddr,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Is operator registered with AVS: ${result}`);
    });

    test("isOperatorRegisteredWithOperatorSet", async () => {
        const operatorAddr = config.operator_address_1;
        const registeredSets =
            await client0.elReader.getRegisteredSets(operatorAddr);
        let operatorSet: OperatorSet;
        let expectedResult: boolean;
        if (registeredSets.length > 0) {
            operatorSet = registeredSets[0];
            expectedResult = true;
        } else {
            operatorSet = {
                id: 0n,
                avs: addresses.registryCoordinator,
            };
            expectedResult = false;
        }
        const result =
            await client0.elReader.isOperatorRegisteredWithOperatorSet(
                operatorAddr,
                operatorSet,
            );
        expect(typeof result).toBe("boolean");
        expect(result).toBe(expectedResult);
        logger.info(
            `Is operator registered with operator set: ${result} (Expected: ${expectedResult})`,
        );
    });

    test("isOperatorSlashable", async () => {
        const operatorAddr = config.operator_address_1;
        const operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet =
            operatorSets.length > 0
                ? operatorSets[0]
                : { id: 0n, avs: addresses.registryCoordinator };
        const result = await client0.elReader.isOperatorSlashable(
            operatorAddr,
            operatorSet,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Is operator slashable: ${result}`);
    });

    test("getAllocatedStake", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet =
            operatorSets.length > 0
                ? operatorSets[0]
                : { id: 0n, avs: addresses.registryCoordinator };
        const result = await client0.elReader.getAllocatedStake(
            operatorSet,
            [operatorAddr],
            [strategyAddr],
        );
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
            expect(result.every((innerList) => Array.isArray(innerList))).toBe(
                true,
            );
            for (const innerList of result) {
                expect(
                    innerList.every((stake) => typeof stake === "bigint"),
                ).toBe(true);
            }
        }
        logger.info(`Allocated stake: ${jsonEncode(result)}`);
    });

    test("getOperatorsForOperatorSet", async () => {
        const avsAddr = addresses.avsAddress;
        const operatorSet: OperatorSet = { id: 1n, avs: avsAddr };
        const result =
            await client0.elReader.getOperatorsForOperatorSet(operatorSet);
        expect(Array.isArray(result)).toBe(true);
        for (const operator of result) {
            expect(client0.ethHttpClient.utils.isAddress(operator)).toBe(true);
        }
        logger.info(`Operators for operator set: ${jsonEncode(result)}`);
    });

    test("getNumOperatorsForOperatorSet", async () => {
        const operatorAddr = config.operator_address_1;
        const operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet =
            operatorSets.length > 0
                ? operatorSets[0]
                : { id: 0n, avs: addresses.registryCoordinator };
        const result =
            await client0.elReader.getNumOperatorsForOperatorSet(operatorSet);
        expect(typeof result).toBe("bigint");
        logger.info(`Number of operators for operator set: ${result}`);
    });

    test("getStrategiesForOperatorSet", async () => {
        const avsAddr = addresses.avsAddress;
        const operatorSet: OperatorSet = { id: 1n, avs: avsAddr };
        const result =
            await client0.elReader.getStrategiesForOperatorSet(operatorSet);
        expect(Array.isArray(result)).toBe(true);
        for (const strategy of result) {
            expect(client0.ethHttpClient.utils.isAddress(strategy)).toBe(true);
        }
        logger.info(`Strategies for operator set: ${jsonEncode(result)}`);
    });

    test("isOperatorRegistered", async () => {
        const operatorAddr = config.operator_address_1;
        const result =
            await client0.elReader.isOperatorRegistered(operatorAddr);
        expect(typeof result).toBe("boolean");
        logger.info(`Is operator registered: ${result}`);
    });

    // test('getStakerShares', async () => {
    //     const stakerAddr = config.operator_address_1;
    //     const [strategies, shares] = await client0.elReader.getStakerShares(stakerAddr);
    //     expect(Array.isArray(strategies)).toBe(true);
    //     expect(Array.isArray(shares)).toBe(true);
    //     expect(strategies.length).toBe(shares.length);
    //     for (const strategy of strategies) {
    //         expect(client0.ethHttpClient.utils.isAddress(strategy)).toBe(true);
    //     }
    //     for (const share of shares) {
    //         expect(typeof share).toBe('number');
    //     }
    //     logger.info(`Staker shares: strategies=${jsonEncode(strategies)}, shares=${jsonEncode(shares)}`);
    // });

    test("getAvsRegistrar", async () => {
        const avsAddr = addresses.avsAddress;
        const result = await client0.elReader.getAvsRegistrar(avsAddr);
        expect(client0.ethHttpClient.utils.isAddress(result)).toBe(true);
        logger.info(`AVS registrar: ${result}`);
    });

    test("getDelegatedOperator", async () => {
        const stakerAddr = config.operator_address_1;
        const result = await client0.elReader.getDelegatedOperator(stakerAddr);
        expect(
            client0.ethHttpClient.utils.isAddress(result) ||
                result === "0x0000000000000000000000000000000000000000",
        ).toBe(true);
        logger.info(`Delegated operator: ${result}`);
        const currentBlock = await client0.ethHttpClient.eth.getBlockNumber();
        const resultWithBlock = await client0.elReader.getDelegatedOperator(
            stakerAddr,
            currentBlock,
        );
        expect(
            client0.ethHttpClient.utils.isAddress(resultWithBlock) ||
                resultWithBlock ===
                    "0x0000000000000000000000000000000000000000",
        ).toBe(true);
        logger.info(
            `Delegated operator at block ${currentBlock}: ${resultWithBlock}`,
        );
    });

    test("getOperatorDetails", async () => {
        const operatorAddr = config.operator_address_1;
        const operator = { address: operatorAddr };
        const result = await client0.elReader.getOperatorDetails(operator);
        expectToHaveProps(result, [
            "address",
            "delegationApproverAddress",
            "allocationDelay",
        ]);
        expect(client0.ethHttpClient.utils.isAddress(result.address)).toBe(
            true,
        );
        expect(typeof result.allocationDelay).toBe("bigint");
        logger.info(`Operator details: ${jsonEncode(result)}`);
    });

    test("getOperatorSharesInStrategy", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const result = await client0.elReader.getOperatorSharesInStrategy(
            operatorAddr,
            strategyAddr,
        );
        expect(typeof result).toBe("bigint");
        logger.info(`Operator shares in strategy: ${result}`);
    });

    test("calculateDelegationApprovalDigestHash", async () => {
        const stakerAddr = config.operator_address_1;
        const operatorAddr = config.operator_address_1;
        const delegationApprover = "0x0000000000000000000000000000000000000000";
        const approverSalt = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const expiry = 2 ** 32 - 1;
        const result =
            await client0.elReader.calculateDelegationApprovalDigestHash(
                stakerAddr,
                operatorAddr,
                delegationApprover,
                approverSalt,
                BigInt(expiry),
            );
        expect(typeof result).toBe("string");
        expect(result.length).toBe(66); // 0x + 32 bytes in hex
        expect(result.startsWith("0x")).toBe(true);
        logger.info(`Delegation approval digest hash: ${result}`);
    });

    test("getOperatorsShares", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const result = await client0.elReader.getOperatorsShares(
            [operatorAddr],
            [strategyAddr],
        );
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((innerList) => Array.isArray(innerList))).toBe(
            true,
        );
        for (const innerList of result) {
            expect(innerList.every((share) => typeof share === "bigint")).toBe(
                true,
            );
        }
        logger.info(`Operators shares: ${jsonEncode(result)}`);
    });

    test("getDelegationApproverSaltIsSpent", async () => {
        const delegationApprover = config.operator_address_1;
        const approverSalt = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await client0.elReader.getDelegationApproverSaltIsSpent(
            delegationApprover,
            approverSalt,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Delegation approver salt is spent: ${result}`);
    });

    test("getPendingWithdrawalStatus", async () => {
        const withdrawalRoot = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result =
            await client0.elReader.getPendingWithdrawalStatus(withdrawalRoot);
        expect(typeof result).toBe("boolean");
        logger.info(`Pending withdrawal status: ${result}`);
    });

    test("getCumulativeWithdrawalsQueued", async () => {
        const stakerAddr = config.operator_address_1;
        const result =
            await client0.elReader.getCumulativeWithdrawalsQueued(stakerAddr);
        expect(typeof result).toBe("bigint");
        logger.info(`Cumulative withdrawals queued: ${result}`);
    });

    test("canCall", async () => {
        const accountAddr = config.operator_address_1;
        const appointeeAddr = config.operator_address_1;
        const targetAddr = addresses.registryCoordinator;
        const selector = chainIoUtils.numsToBytes([12, 34, 56, 78]);
        const result = await client0.elReader.canCall(
            accountAddr,
            appointeeAddr,
            targetAddr,
            selector,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Can call: ${result}`);
    });

    test("listAppointees", async () => {
        const accountAddr = config.operator_address_1;
        const targetAddr = addresses.registryCoordinator;
        const selector = chainIoUtils.numsToBytes([12, 34, 56, 78]);
        const result = await client0.elReader.listAppointees(
            accountAddr,
            targetAddr,
            selector,
        );
        expect(Array.isArray(result)).toBe(true);
        for (const appointee of result) {
            expect(client0.ethHttpClient.utils.isAddress(appointee)).toBe(true);
        }
        logger.info(`Appointees: ${jsonEncode(result)}`);
    });

    test("listAppointeePermissions", async () => {
        const accountAddr = config.operator_address_1;
        const appointeeAddr = config.operator_address_1;
        const [targets, selectors] =
            await client0.elReader.listAppointeePermissions(
                accountAddr,
                appointeeAddr,
            );
        expect(targets.length).toBe(selectors.length);
        for (const target of targets) {
            expect(client0.ethHttpClient.utils.isAddress(target)).toBe(true);
        }
        for (const selector of selectors) {
            expect(typeof selector).toBe("string");
            expect(selector.startsWith("0x")).toBe(true);
        }
        logger.info(
            `Appointee permissions: targets=${jsonEncode(targets)}, selectors=[${selectors.map((s) => s).join(", ")}]`,
        );
    });

    test("listPendingAdmins", async () => {
        const accountAddr = config.operator_address_1;
        const result = await client0.elReader.listPendingAdmins(accountAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const admin of result) {
            expect(client0.ethHttpClient.utils.isAddress(admin)).toBe(true);
        }
        logger.info(`Pending admins: ${jsonEncode(result)}`);
    });

    test("listAdmins", async () => {
        const accountAddr = config.operator_address_1;
        const result = await client0.elReader.listAdmins(accountAddr);
        expect(Array.isArray(result)).toBe(true);
        for (const admin of result) {
            expect(client0.ethHttpClient.utils.isAddress(admin)).toBe(true);
        }
        logger.info(`Admins: ${jsonEncode(result)}`);
    });

    test("isPendingAdmin", async () => {
        const accountAddr = config.operator_address_1;
        const pendingAdminAddr = config.operator_address_1;
        const result = await client0.elReader.isPendingAdmin(
            accountAddr,
            pendingAdminAddr,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Is pending admin: ${result}`);
    });

    test("isAdmin", async () => {
        const accountAddr = config.operator_address_1;
        const adminAddr = config.operator_address_1;
        const result = await client0.elReader.isAdmin(accountAddr, adminAddr);
        expect(typeof result).toBe("boolean");
        logger.info(`Is admin: ${result}`);
    });

    test("getDistributionRootsLength", async () => {
        const result = await client0.elReader.getDistributionRootsLength();
        expect(typeof result).toBe("bigint");
        logger.info(`Distribution roots length: ${result}`);
    });

    test("getCurrRewardsCalculationEndTimestamp", async () => {
        const result =
            await client0.elReader.getCurrRewardsCalculationEndTimestamp();
        expect(typeof result).toBe("bigint");
        logger.info(`Current rewards calculation end timestamp: ${result}`);
    });

    test("getCurrentClaimableDistributionRoot", async () => {
        const result =
            await client0.elReader.getCurrentClaimableDistributionRoot();
        expectToHaveProps(result, [
            "root",
            "rewardsCalculationEndTimestamp",
            "activatedAt",
            "disabled",
        ]);
        logger.info(
            `Current claimable distribution root: ${jsonEncode(result)}`,
        );
    });

    test("getCumulativeClaimed", async () => {
        const earnerAddr = config.operator_address_1;
        const tokenAddr = addresses.erc20MockStrategy;
        const result = await client0.elReader.getCumulativeClaimed(
            earnerAddr,
            tokenAddr,
        );
        expect(typeof result).toBe("bigint");
        logger.info(`Cumulative claimed: ${result}`);
    });

    test("getOperatorAvsSplit", async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = addresses.avsAddress;
        const result = await client0.elReader.getOperatorAvsSplit(
            operatorAddr,
            avsAddr,
        );
        expect(typeof result).toBe("bigint");
        logger.info(`Operator AVS split: ${result}`);
    });

    test("getOperatorPiSplit", async () => {
        const operatorAddr = config.operator_address_1;
        const result = await client0.elReader.getOperatorPiSplit(operatorAddr);
        expect(typeof result).toBe("bigint");
        logger.info(`Operator PI split: ${result}`);
    });

    test("getOperatorSetSplit", async () => {
        const operatorAddr = config.operator_address_1;
        const operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet =
            operatorSets.length > 0
                ? operatorSets[0]
                : { id: 0n, avs: addresses.registryCoordinator };
        const result = await client0.elReader.getOperatorSetSplit(
            operatorAddr,
            operatorSet,
        );
        expect(typeof result).toBe("bigint");
        logger.info(`Operator set split: ${result}`);
    });

    test("getRewardsUpdater", async () => {
        const result = await client0.elReader.getRewardsUpdater();
        expect(client0.ethHttpClient.utils.isAddress(result)).toBe(true);
        logger.info(`Rewards updater: ${result}`);
    });

    test("getDefaultOperatorSplitBips", async () => {
        const result = await client0.elReader.getDefaultOperatorSplitBips();
        expect(typeof result).toBe("bigint");
        logger.info(`Default operator split bips: ${result}`);
    });

    test("getClaimerFor", async () => {
        const earnerAddr = config.operator_address_1;
        const result = await client0.elReader.getClaimerFor(earnerAddr);
        expect(client0.ethHttpClient.utils.isAddress(result)).toBe(true);
        logger.info(`Claimer for ${earnerAddr}: ${result}`);
    });

    test("getSubmissionNonce", async () => {
        const avsAddr = addresses.avsAddress;
        const result = await client0.elReader.getSubmissionNonce(avsAddr);
        expect(typeof result).toBe("bigint");
        logger.info(`Submission nonce: ${result}`);
    });

    test("getIsAvsRewardsSubmissionHash", async () => {
        const avsAddr = addresses.avsAddress;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await client0.elReader.getIsAvsRewardsSubmissionHash(
            avsAddr,
            hashValue,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Is AVS rewards submission hash: ${result}`);
    });

    test("getIsRewardsSubmissionForAllHash", async () => {
        const avsAddr = addresses.avsAddress;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result = await client0.elReader.getIsRewardsSubmissionForAllHash(
            avsAddr,
            hashValue,
        );
        expect(typeof result).toBe("boolean");
        logger.info(`Is rewards submission for all hash: ${result}`);
    });

    test("getIsRewardsForAllSubmitter", async () => {
        const submitterAddr = config.operator_address_1;
        const result =
            await client0.elReader.getIsRewardsForAllSubmitter(submitterAddr);
        expect(typeof result).toBe("boolean");
        logger.info(`Is rewards for all submitter: ${result}`);
    });

    test("getIsRewardsSubmissionForAllEarnersHash", async () => {
        const avsAddr = addresses.avsAddress;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result =
            await client0.elReader.getIsRewardsSubmissionForAllEarnersHash(
                avsAddr,
                hashValue,
            );
        expect(typeof result).toBe("boolean");
        logger.info(`Is rewards submission for all earners hash: ${result}`);
    });

    test("getIsOperatorDirectedAvsRewardsSubmissionHash", async () => {
        const avsAddr = addresses.avsAddress;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result =
            await client0.elReader.getIsOperatorDirectedAvsRewardsSubmissionHash(
                avsAddr,
                hashValue,
            );
        expect(typeof result).toBe("boolean");
        logger.info(
            `Is operator directed AVS rewards submission hash: ${result}`,
        );
    });

    test("getIsOperatorDirectedOperatorSetRewardsSubmissionHash", async () => {
        const avsAddr = addresses.avsAddress;
        const hashValue = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const result =
            await client0.elReader.getIsOperatorDirectedOperatorSetRewardsSubmissionHash(
                avsAddr,
                hashValue,
            );
        expect(typeof result).toBe("boolean");
        logger.info(
            `Is operator directed operator set rewards submission hash: ${result}`,
        );
    });

    test("getStrategyAndUnderlyingToken", async () => {
        const strategyAddr = addresses.erc20MockStrategy;
        const [strategyContract, tokenAddr] =
            await client0.elReader.getStrategyAndUnderlyingToken(strategyAddr);
        expect(client0.ethHttpClient.utils.isAddress(tokenAddr)).toBe(true);
        logger.info(
            `Strategy and underlying token: contract=${strategyContract.options.address}, token_addr=${tokenAddr}`,
        );
    });

    test("getStrategyAndUnderlyingErc20Token", async () => {
        const strategyAddr = addresses.erc20MockStrategy;
        const [strategyContract, tokenContract, tokenAddr] =
            await client0.elReader.getStrategyAndUnderlyingErc20Token(
                strategyAddr,
            );
        expect(client0.ethHttpClient.utils.isAddress(tokenAddr)).toBe(true);
        logger.info(
            `Strategy and underlying ERC20 token: token_addr=${tokenAddr}, token_contract=${tokenContract.options.address}, strategy_contract=${strategyContract.options.address}`,
        );
    });

    test("calculateOperatorAvsRegistrationDigestHash", async () => {
        const operatorAddr = config.operator_address_1;
        const avsAddr = addresses.avsAddress;
        const salt = chainIoUtils.numsToBytes(new Array(32).fill(0));
        const expiry = 2 ** 32 - 1;
        // @ts-ignore
        const result: string =
            await client0.elReader.calculateOperatorAvsRegistrationDigestHash(
                operatorAddr,
                avsAddr,
                salt,
                BigInt(expiry),
            );
        expect(typeof result).toBe("string");
        expect(result.length).toBe(66);
        expect(result.startsWith("0x")).toBe(true);
        logger.info(`Operator AVS registration digest hash: ${result}`);
    });

    test("getEncumberedMagnitude", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const result = await client0.elReader.getEncumberedMagnitude(
            operatorAddr,
            strategyAddr,
        );
        expect(typeof result).toBe("bigint");
        logger.info(`Encumbered magnitude: ${result}`);
    });

    test("getCalculationIntervalSeconds", async () => {
        const result = await client0.elReader.getCalculationIntervalSeconds();
        expect(typeof result).toBe("bigint");
        logger.info(`Calculation interval seconds: ${result}`);
    });

    test("getMaxRewardsDuration", async () => {
        const result = await client0.elReader.getMaxRewardsDuration();
        expect(typeof result).toBe("bigint");
        logger.info(`Max rewards duration: ${result}`);
    });

    test("getMaxRetroactiveLength", async () => {
        const result = await client0.elReader.getMaxRetroactiveLength();
        expect(typeof result).toBe("bigint");
        logger.info(`Max retroactive length: ${result}`);
    });

    test("getMaxFutureLength", async () => {
        const result = await client0.elReader.getMaxFutureLength();
        expect(typeof result).toBe("bigint");
        logger.info(`Max future length: ${result}`);
    });

    test("getGenesisRewardsTimestamp", async () => {
        const result = await client0.elReader.getGenesisRewardsTimestamp();
        expect(typeof result).toBe("bigint");
        logger.info(`Genesis rewards timestamp: ${result}`);
    });

    test("getActivationDelay", async () => {
        const result = await client0.elReader.getActivationDelay();
        expect(typeof result).toBe("bigint");
        logger.info(`Activation delay: ${result}`);
    });

    test("getDeallocationDelay", async () => {
        const result = await client0.elReader.getDeallocationDelay();
        expect(typeof result).toBe("bigint");
        logger.info(`Deallocation delay: ${result}`);
    });

    test("getAllocationConfigurationDelay", async () => {
        const result = await client0.elReader.getAllocationConfigurationDelay();
        expect(typeof result).toBe("bigint");
        logger.info(`Allocation configuration delay: ${result}`);
    });

    test("getNumOperatorSetsForOperator", async () => {
        const operatorAddr = config.operator_address_1;
        const result =
            await client0.elReader.getNumOperatorSetsForOperator(operatorAddr);
        expect(typeof result).toBe("number");
        logger.info(`Number of operator sets for operator: ${result}`);
    });

    test("getSlashableShares", async () => {
        const operatorAddr = config.operator_address_1;
        const strategyAddr = addresses.erc20MockStrategy;
        const operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        const operatorSet: OperatorSet =
            operatorSets.length > 0
                ? operatorSets[0]
                : { id: 0n, avs: addresses.registryCoordinator };
        const result = await client0.elReader.getSlashableShares(
            operatorAddr,
            operatorSet,
            [strategyAddr],
        );
        expect(isObject(result)).toBe(true);
        logger.info(`Slashable shares: ${jsonEncode(result)}`);
    });

    test("getSlashableSharesForOperatorSetsBefore", async () => {
        const operatorAddr = config.operator_address_1;
        let operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        if (!operatorSets.length) {
            operatorSets = [{ id: 1n, avs: addresses.registryCoordinator }];
        }
        const currentBlock = await client0.ethHttpClient.eth.getBlockNumber();
        const result =
            await client0.elReader.getSlashableSharesForOperatorSetsBefore(
                operatorSets,
                currentBlock,
            );
        expect(Array.isArray(result)).toBe(true);
        logger.info(
            `Slashable shares for operator sets before: ${jsonEncode(result)}`,
        );
    });

    test("getSlashableSharesForOperatorSets", async () => {
        const operatorAddr = config.operator_address_1;
        let operatorSets =
            await client0.elReader.getOperatorSetsForOperator(operatorAddr);
        if (!operatorSets.length) {
            operatorSets = [{ id: 1n, avs: addresses.registryCoordinator }];
        }
        const result: SlashableStake[] | null =
            await client0.elReader.getSlashableSharesForOperatorSets(
                operatorSets,
            );
        expect(Array.isArray(result)).toBe(true);
        for (const item of result || []) {
            expect(typeof item).toBe("object");
            expect("operatorSet" in item).toBe(true);
            expect("strategies" in item).toBe(true);
            expect("operators" in item).toBe(true);
            expect("slashableStakes" in item).toBe(true);
            const operatorSet = item.operatorSet;
            expect(typeof operatorSet).toBe("object");
            expect("id" in operatorSet).toBe(true);
            expect("avs" in operatorSet).toBe(true);
            expect(typeof operatorSet.id).toBe("bigint");
            expect(client0.ethHttpClient.utils.isAddress(operatorSet.avs)).toBe(
                true,
            );
            expect(Array.isArray(item.strategies)).toBe(true);
            expect(Array.isArray(item.operators)).toBe(true);
            expect(Array.isArray(item.slashableStakes)).toBe(true);
            for (const strategy of item.strategies) {
                expect(client0.ethHttpClient.utils.isAddress(strategy)).toBe(
                    true,
                );
            }
            for (const operator of item.operators) {
                expect(client0.ethHttpClient.utils.isAddress(operator)).toBe(
                    true,
                );
            }
            for (const stake of item.slashableStakes) {
                expect(typeof stake).toBe("bigint");
            }
        }
        logger.info(
            `Slashable shares for operator sets: ${jsonEncode(result)}`,
        );
    });
});
