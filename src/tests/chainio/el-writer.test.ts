import { AbiItem, TransactionReceipt, Web3 } from 'web3';
import { ethers } from "ethers"
import { buildClients, buildSingleClient, config } from '../builder';
import { Clients } from '../../chainio/clients/builder.js';
import * as testUtils from '../utils/anvil.js';
import { init as attestationInit, KeyPair, PrivateKey } from '../../crypto/bls/attestation.js';
import * as ABIs from '../../contracts/ABIs'
import { describe, test, expect, beforeAll } from 'vitest';
import pino from 'pino';
import { timeout } from '../utils/test-utils.js';
import { Operator, OperatorSet, OperatorSetParams, StrategyParams, Uint16, Uint32, Uint256 } from '../../types/general.js';
import { GenericContainer, TestContainer } from 'testcontainers';
import { abiEncodeNormalRegistrationParams, abiEncodeRegistrationWithChurnParams, arrayify, PubkeyRegistrationParams, sendContractCall } from '../../chainio/utils.js';
import { OperatorKickParam, RegistrationRequest, SignatureWithSaltAndExpiry } from '../../chainio/clients/elcontracts/types.js';
import { abiEncodeData } from '../../utils/helpers.js';
import { ClaimCheckParams, ELReader } from '../../chainio/clients/elcontracts/reader.js';

const logger = pino({
    level: 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
    },
});

describe("elwriter tests", async () => {
    await attestationInit()

    describe('RegisterOperator', () => {
        let clients: Clients[];
        let addresses: testUtils.ContractAddresses;
        let client0: Clients;
        let container: GenericContainer;
        let endpoint: string;

        beforeAll(async () => {
            const testConfigs = testUtils.getDefaultTestConfig();
            ({ container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName));

            ({ clients, addresses } = await buildClients(endpoint));
            client0 = clients[0];
        });

        test('should register as an operator', async () => {
            const fundedAccount = '0x408EfD9C90d59298A9b32F4441aC9Df6A2d8C3E1';
            const fundedPrivateKeyHex = '3339854a8622364bcd5650fa92eac82d5dccf04089f5575a761c9b7d3c405b1c';
            const richPrivateKeyHex = testUtils.ANVIL_FIRST_PRIVATE_KEY;

            // Fund the account with 5 ether
            const { exitCode, stderr } = await container.exec([
                'cast',
                'send',
                fundedAccount,
                '--value',
                '5ether',
                '--private-key',
                richPrivateKeyHex,
            ]);
            expect(exitCode).toBe(0)
            expect(stderr).toBe('');

            // Wait for the account to be funded
            await timeout(1500);

            const operator: Operator = {
                address: fundedAccount,
                delegationApproverAddress: '0xd5e099c71b797516c10ed0f0d895f429c2781142',
                metadataUrl: 'https://madhur-test-public.s3.us-east-2.amazonaws.com/metadata.json',
                earningsReceiverAddress: fundedAccount,
                allocationDelay: 50n,
                stakerOptOutWindowBlocks: 100n,
            };

            const fundingClient = await buildSingleClient(fundedPrivateKeyHex, endpoint);
            const receipt = await fundingClient.elWriter.registerAsOperator(operator);
            expect(receipt).not.toBeNull();
            expect(receipt.status).toBe(1n);
        });

        test('should fail to register an already registered operator', async () => {
            const operatorAddress = '0x408EfD9C90d59298A9b32F4441aC9Df6A2d8C3E1';
            const operatorPrivateKeyHex = '3339854a8622364bcd5650fa92eac82d5dccf04089f5575a761c9b7d3c405b1c'

            const operator: Operator = {
                address: operatorAddress,
                delegationApproverAddress: '0xd5e099c71b797516c10ed0f0d895f429c2781142',
                metadataUrl: 'https://madhur-test-public.s3.us-east-2.amazonaws.com/metadata.json',
                earningsReceiverAddress: operatorAddress,
                allocationDelay: 50n,
                stakerOptOutWindowBlocks: 100n,
            };

            const operatorClient = await buildSingleClient(operatorPrivateKeyHex, endpoint);

            await expect(
                operatorClient.elWriter.registerAsOperator(operator)
            ).rejects.toThrow();
        });
    });

    describe('RegisterAndDeregisterFromOperatorSets', async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses } = await buildClients(endpoint);
        const client0 = clients[0];

        const avsAddress = addresses.serviceManager;
        const operatorSetId = 1n;
        const erc20MockStrategyAddr = addresses.erc20MockStrategy;
        const operatorAddress = testUtils.ANVIL_FIRST_ADDRESS;

        console.log(client0)
        // Create an operator set to register an operator on it
        const receipt = await createTotalStakeOperatorSet(client0, erc20MockStrategyAddr);
        expect(receipt.status).toBe(1n);

        const keypair = KeyPair.fromString("0x01", 16);

        const request = {
            operatorAddress,
            avsAddress,
            operatorSetIds: [operatorSetId],
            socket: 'socket',
            blsKeyPair: keypair,
        };

        const operatorSet: OperatorSet = {
            avs: avsAddress,
            id: operatorSetId,
        };

        test('should register operator for operator set', async () => {
            const receipt = await client0.elWriter.registerForOperatorSets(
                addresses.registryCoordinator,
                request,
            );
            expect(receipt.status).toBe(1n); // 1 indicates successful transaction in ethers.js

            const isRegistered = await client0.elReader.isOperatorRegisteredWithOperatorSet(
                operatorAddress,
                operatorSet,
            );
            console.log({ isRegistered })
            expect(isRegistered).toBe(true);
        });

        test('should fail to register operator for same operator set', async () => {
            await expect(
                client0.elWriter.registerForOperatorSets(
                    addresses.registryCoordinator,
                    request,
                )
            ).rejects.toThrow(/AlreadyMemberOfSet/);
        });

        const deregistrationRequest = {
            avs: avsAddress,
            operatorSetIds: [operatorSetId]
        };

        test('should deregister operator from operator set', async () => {
            const receipt = await client0.elWriter.deregisterFromOperatorSets(
                operatorAddress,
                deregistrationRequest,
            );

            expect(receipt.status).toBe(1n); // 1 indicates successful transaction in ethers.js

            const isRegistered = await client0.elReader.isOperatorRegisteredWithOperatorSet(
                operatorAddress,
                operatorSet,
            );
            expect(isRegistered).toBe(false);
        });

        test('should fail to deregister operator from operator set when not registered', async () => {
            await expect(
                client0.elWriter.deregisterFromOperatorSets(
                    operatorAddress,
                    deregistrationRequest,
                )
            ).rejects.toThrow(/NotMemberOfSet/);
        });
    });

    describe('RegisterOperatorSetWithChurn', async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses } = await buildClients(endpoint);

        const avsAddress = addresses.serviceManager;
        const op1Address = testUtils.ANVIL_FIRST_ADDRESS;
        const op2Address = testUtils.ANVIL_SECOND_ADDRESS;
        const op2PrivateKeyHex = testUtils.ANVIL_SECOND_PRIVATE_KEY;

        const operatorSetId = 1n;
        const erc20MockStrategyAddr = addresses.erc20MockStrategy;

        let op2Clients = await buildSingleClient(op2PrivateKeyHex, endpoint);

        // Create an operator set
        await createTotalStakeOperatorSet(clients[0], erc20MockStrategyAddr);


        test('should register operator set with churn', async () => {
            // Allow only 1 operator
            const opsetParams: OperatorSetParams = {
                maxOperatorCount: 1n,
                kickBIPsOfOperatorStake: 10n,
                kickBIPsOfTotalStake: 10000n,
            };

            const receipt = await clients[0].avsRegistryWriter.setOperatorSetParams(operatorSetId, opsetParams);
            expect(receipt.status).toBe(1n); // 1 indicates successful transaction in ethers.js

            // Register first operator
            const privKey1 = KeyPair.fromString('0x01');
            const registrationRequest: RegistrationRequest = {
                operatorAddress: op1Address,
                avsAddress: avsAddress,
                operatorSetIds: [operatorSetId],
                socket: 'socket',
                blsKeyPair: privKey1,
            };

            const receipt1 = await clients[0].elWriter.registerForOperatorSets(
                addresses.registryCoordinator,
                registrationRequest,
            );
            expect(receipt1.status).toBe(1n);

            // Register second operator with churn
            const privKey2 = KeyPair.fromString('0x02');

            registrationRequest.operatorAddress = op2Address;
            registrationRequest.blsKeyPair = privKey2;
            registrationRequest.churnApprovalEcdsaPrivateKey = testUtils.ANVIL_FIRST_PRIVATE_KEY;
            registrationRequest.operatorKickParams = [
                {
                    quorumNumber: operatorSetId,
                    operator: op1Address,
                },
            ];

            try {
                const receipt2 = await op2Clients.elWriter.registerForOperatorSets(
                    addresses.registryCoordinator,
                    registrationRequest,
                );
                expect(receipt2.status).toBe(1n);
            }
            catch (e) {
                console.log(e)
                throw e
            }

            // Check operator 1 is no longer registered
            const operatorSet: OperatorSet = {
                avs: avsAddress,
                id: operatorSetId,
            };

            const isOp1Registered = await clients[0].elReader.isOperatorRegisteredWithOperatorSet(
                op1Address,
                operatorSet,
            );
            expect(isOp1Registered).toBe(false);

            // Check operator 2 is registered
            const isOp2Registered = await op2Clients.elReader.isOperatorRegisteredWithOperatorSet(
                op2Address,
                operatorSet,
            );
            expect(isOp2Registered).toBe(true);
        });
    });

    function getExampleRegistrationParams(): PubkeyRegistrationParams {
        return {
            pubkeyRegistrationSignature: [
                BigInt("756874975973566196338995715738218418291193261429375530560923897690728869289"),
                BigInt("444340189040315797681399101731743234568891767085799644128199800550863908703"),
            ],
            pubkeyG1: [
                BigInt("10371454967541283327403832945957227913391851874635485454053224012738342927470"),
                BigInt("5591557118325006940652332791312874698324071372762903093203759620236776485604"),
            ],
            pubkeyG2: [
                [
                    BigInt("1357671944470767405259541876666418155809079857448568479000932998534484593852"),
                    BigInt("5283708918582394678225755661661470830476341241033602812294790796852421312310"),
                ],
                [
                    BigInt("17411007011468414688052176335308121672943440336543041782092111920184779631952"),
                    BigInt("6486088401181402728530570019430319265466049090881984123818353102069786218525"),
                ],
            ],
        };
    }

    describe("TestEncodeRegistrationParams", () => {
        test("test registration params encoding", () => {
            const registrationParams = getExampleRegistrationParams();

            const result = abiEncodeNormalRegistrationParams(
                "unused",
                registrationParams
            )

            // Expected value from Go test
            const expected =
                "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014001ac6045296d64b31ed644e53ce1a1c4f72f67a2d47b06b652ca8167f1b2ada900fb7cd59f322f4dffa18360bfcdc15f1f6cd09aea573efa919dc828dfabaf5f16ee091592629fc566636de7b3d53322f4833014b4655dd57279cfb2828bbc6e0c5cb58c8d572dc9dcf5f5999501533e22243fac4f8ee4452a6dd0d4bcaeb2e403006a43453d56eafa7dc4ddcbd41b2330031f58e437ee3806c50a9e554a0cbc0bae792831463d56a1a9983647b77fcdbae38a6621ceef9e147614bb4869bf36267e47def74c144f8e7238dd088097943d1007f8ce7cab028151e9a1beac6d500e56fef5ea67a586d1fbb03dcc0a268f6c4835ad1c215eadc77cc676c378101d0000000000000000000000000000000000000000000000000000000000000006756e757365640000000000000000000000000000000000000000000000000000";

            expect(expected).toBe(result);
        })
    });

    describe("TestEncodeChurnRegistrationParams", () => {
        test("test registration with churn params encoding", () => {
            const registrationParams: PubkeyRegistrationParams = getExampleRegistrationParams();
            const operatorKickParams: OperatorKickParam[] = [
                {
                    quorumNumber: 0n,
                    operator: "0x1374038C2E2403f9aB7db62EE7516e0119F1124A",
                },
                {
                    quorumNumber: 1n,
                    operator: "0xD393FD495367164d7eB53840e59469c13266bA59",
                },
            ]
            const signatureWithSaltAndExpiry: SignatureWithSaltAndExpiry = {
                signature: "0xd547fa0126f97d1752a3b3103c495961a4a6a7a5386feb32ac514289c578db5a0d64bfa34855c39d78cce241a9c73d5cae47dee02c691fd5320fdef4ad3e1f8e",
                salt: "0x7879ea091cd16d7afec6bc1e96b92f2229f744c703fb9603b2ca6f60ea9df6c0",
                expiry: 138752197623537982159531315300136159918886501617089726422768086017712946835n
            }

            const result = abiEncodeRegistrationWithChurnParams(
                "unused",
                registrationParams,
                operatorKickParams,
                signatureWithSaltAndExpiry
            )

            // Expected value from Go test
            const expected =
                "0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000018001ac6045296d64b31ed644e53ce1a1c4f72f67a2d47b06b652ca8167f1b2ada900fb7cd59f322f4dffa18360bfcdc15f1f6cd09aea573efa919dc828dfabaf5f16ee091592629fc566636de7b3d53322f4833014b4655dd57279cfb2828bbc6e0c5cb58c8d572dc9dcf5f5999501533e22243fac4f8ee4452a6dd0d4bcaeb2e403006a43453d56eafa7dc4ddcbd41b2330031f58e437ee3806c50a9e554a0cbc0bae792831463d56a1a9983647b77fcdbae38a6621ceef9e147614bb4869bf36267e47def74c144f8e7238dd088097943d1007f8ce7cab028151e9a1beac6d500e56fef5ea67a586d1fbb03dcc0a268f6c4835ad1c215eadc77cc676c378101d00000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000002600000000000000000000000000000000000000000000000000000000000000006756e757365640000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000001374038c2e2403f9ab7db62ee7516e0119f1124a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000d393fd495367164d7eb53840e59469c13266ba5900000000000000000000000000000000000000000000000000000000000000607879ea091cd16d7afec6bc1e96b92f2229f744c703fb9603b2ca6f60ea9df6c0004e87ed0c684886b5b2e661e58348383df270f2ad5630aaadde83c88c517e930000000000000000000000000000000000000000000000000000000000000040d547fa0126f97d1752a3b3103c495961a4a6a7a5386feb32ac514289c578db5a0d64bfa34855c39d78cce241a9c73d5cae47dee02c691fd5320fdef4ad3e1f8e";

            expect(expected).toBe(result);
        })
    });

    describe("ChainWriter", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        test("update operator details", async () => {
            const operatorModified: Operator = {
                address: testUtils.ANVIL_FIRST_ADDRESS,
                delegationApproverAddress: testUtils.ANVIL_FIRST_ADDRESS,
                metadataUrl: "eigensdk-ts",
                allocationDelay: 0n,
                earningsReceiverAddress: "",
            };

            const receipt = await client0.elWriter.updateOperatorDetails(operatorModified);
            expect(receipt.status).toBe(1n);
        });

        test("update operator details when address is not an operator", async () => {
            const wrongOperatorModified: Operator = {
                address: testUtils.ANVIL_THIRD_ADDRESS,
                delegationApproverAddress: testUtils.ANVIL_FIRST_ADDRESS,
                metadataUrl: "eigensdk-ts",
                allocationDelay: 0n,
                earningsReceiverAddress: "",
            };

            await expect(
                client0.elWriter.updateOperatorDetails(wrongOperatorModified)
            ).rejects.toThrow(/InvalidPermissions/);
        });

        test("update metadata URI", async () => {
            const receipt = await client0.elWriter.updateMetadataUri(
                testUtils.ANVIL_FIRST_ADDRESS,
                "https://0.0.0.0",
            );
            expect(receipt.status).toBe(1n);
        });

        test("update metadata URI when address is not an operator", async () => {
            await expect(
                client0.elWriter.updateMetadataUri(
                    testUtils.ANVIL_THIRD_ADDRESS,
                    "https://0.0.0.0",
                )
            ).rejects.toThrow(/InvalidPermissions/);
        });

        test("deposit ERC20 into strategy", async () => {
            const amount = 1n;
            const receipt = await client0.elWriter.depositErc20IntoStrategy(
                contractAddrs.erc20MockStrategy,
                amount,
            );
            expect(receipt.status).toBe(1n);
        });
    });

    describe("TestSetClaimerFor", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        test("should call SetClaimerFor successfully", async () => {
            // choose claimer (using contract address just like in Go test)
            const claimer = contractAddrs.rewardsCoordinator;

            // call SetClaimerFor
            const receipt = await client0.elWriter.setClaimerFor(claimer);

            // check status
            expect(receipt.status).toBe(1n);
        });
    });

    describe("TestSetOperatorPISplit", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        test("should update operator PI split correctly", async () => {
            const operatorAddr = testUtils.ANVIL_FIRST_ADDRESS;
            const { rewardsCoordinator } = client0.elWriter

            // 1. set activation delay = 0 (helper in Go → direct call here)
            const receiptDelay: TransactionReceipt = await setTestRewardsCoordinatorActivationDelay(
                endpoint,
                testUtils.ANVIL_FIRST_PRIVATE_KEY,
                0n
            )
            expect(receiptDelay.status).toBe(1n);

            // 2. read initial split
            const initialSplit: bigint =
                await rewardsCoordinator.methods.getOperatorPISplit(operatorAddr).call();
            expect(initialSplit).toEqual(1000n); // matches Go test expectedInitialSplit

            // 3. set new split
            const newSplit = initialSplit + 1n;
            const tx: TransactionReceipt = await client0.elWriter.setOperatorPiSplit(
                operatorAddr,
                newSplit
            );
            expect(tx?.status).toEqual(1n);

            // 4. check updated value
            const updatedSplit: bigint =
                await rewardsCoordinator.methods.getOperatorPISplit(operatorAddr).call();
            expect(updatedSplit).toEqual(newSplit);

            // 5. invalid split should revert
            const invalidSplit = 10001n;
            await expect(
                client0.elWriter.setOperatorPiSplit(operatorAddr, invalidSplit)
            ).rejects.toThrow(/SplitExceedsMax/);
        });
    });

    describe("TestSetOperatorAVSSplit", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        test("should update operator AVS split correctly", async () => {
            const operatorAddr = testUtils.ANVIL_FIRST_ADDRESS;
            const avsAddr = contractAddrs.serviceManager;

            // 1. set activation delay = 0 (Go helper → direct call in tests)
            const receiptDelay: TransactionReceipt = await sendContractCall({
                contract: client0.elWriter.rewardsCoordinator,
                method: "setActivationDelay",
                params: [0n],
                pkWallet: client0.pkWallet,
                web3: client0.elWriter.ethHttpClient,
                abi: Object.values(ABIs).flat()
            });
            expect(receiptDelay.status).toEqual(1n);

            // 2. read initial split
            const initialSplit: bigint = await client0.elWriter.rewardsCoordinator.methods.getOperatorAVSSplit(
                operatorAddr,
                avsAddr
            ).call();
            expect(initialSplit).toEqual(1000n); // same as Go expectedInitialSplit

            // 3. set new AVS split
            const newSplit = initialSplit + 1n;
            const receipt = await sendContractCall({
                contract: client0.elWriter.rewardsCoordinator,
                method: "setOperatorAVSSplit",
                params: [
                    operatorAddr,
                    avsAddr,
                    newSplit
                ],
                pkWallet: client0.elWriter.pkWallet,
                web3: client0.elWriter.ethHttpClient,
                abi: Object.values(ABIs).flat(),
            });
            expect(receipt?.status).toEqual(1n);

            // 4. verify updated split
            const updatedSplit: bigint = await client0.elWriter.rewardsCoordinator.methods.getOperatorAVSSplit(
                operatorAddr,
                avsAddr
            ).call();
            expect(updatedSplit).toEqual(newSplit);

            // 5. invalid split should revert
            const invalidSplit = 10001n;
            await expect(
                sendContractCall({
                    contract: client0.elWriter.rewardsCoordinator,
                    method: "setOperatorAVSSplit",
                    params: [operatorAddr, avsAddr, invalidSplit],
                    pkWallet: client0.elWriter.pkWallet,
                    web3: client0.elWriter.ethHttpClient,
                    abi: Object.values(ABIs).flat(),
                })
            ).rejects.toThrow(/SplitExceedsMax/);
        });
    });

    describe("TestSetOperatorSetSplit", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        test("should register operator in operator set and update split", async () => {
            const { rewardsCoordinator, registryCoordinator } = client0.elWriter;

            const operatorAddr = testUtils.ANVIL_FIRST_ADDRESS;
            const avsAddr = contractAddrs.serviceManager;
            const operatorSetId = 0n;
            const from = operatorAddr;

            // 1. Set activation delay to 0 (so splits take effect immediately)
            const receiptDelay: TransactionReceipt = await rewardsCoordinator.methods.setActivationDelay(0n)
                .send({ from });
            expect(receiptDelay.status).toEqual(1n);

            // 2. Create an operator set (Go had `createTotalStakeOperatorSet`)
            // In TS, call the same contract function manually
            const receiptCreate = await createTotalStakeOperatorSet(
                client0,
                contractAddrs.erc20MockStrategy
            );
            expect(receiptCreate.status).toEqual(1n);

            // 3. Register operator in operator set
            const receiptReg = await client0.elWriter.registerForOperatorSets(
                contractAddrs.registryCoordinator,
                {
                    operatorAddress: operatorAddr,
                    avsAddress: avsAddr,
                    operatorSetIds: [operatorSetId],
                    socket: "socket", // socket metadata
                    blsKeyPair: new KeyPair() // BLS pubkey (dummy for test)
                }
            );
            expect(receiptReg.status).toEqual(1n);

            // 4. Verify registration
            const isRegistered: boolean =
                await client0.elReader.isOperatorRegisteredWithOperatorSet(
                    operatorAddr,
                    { avs: avsAddr, id: operatorSetId }
                );
            expect(isRegistered).toBe(true);

            // 5. Get initial split
            const initialSplit: bigint =
                await client0.elReader.getOperatorSetSplit(operatorAddr, {
                    avs: avsAddr,
                    id: operatorSetId,
                });
            expect(initialSplit).toEqual(1000n);

            // 6. Set new split
            const newSplit = initialSplit + 1n;
            const receiptSet = await rewardsCoordinator.methods.setOperatorSetSplit(
                operatorAddr,
                { avs: avsAddr, id: operatorSetId },
                newSplit
            ).send({ from });
            expect(receiptSet?.status).toEqual(1n);

            // 7. Verify updated split
            const updatedSplit: bigint =
                await rewardsCoordinator.methods.getOperatorSetSplit(operatorAddr, {
                    avs: avsAddr,
                    id: operatorSetId,
                }).call();
            expect(updatedSplit).toEqual(newSplit);
        });
    });

    describe("TestSetAllocationDelay", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        test("set allocation delay", async () => {
            const delay = 10n;
            const receipt = await client0.elWriter.setAllocationDelay(
                testUtils.ANVIL_FIRST_ADDRESS,
                delay
            );
            expect(receipt.status).toBe(1n);
        });

        test("set allocation delay with invalid caller", async () => {
            const delay = 20n;
            await expect(
                client0.elWriter.setAllocationDelay(
                    testUtils.ANVIL_SECOND_ADDRESS,
                    delay
                )
            ).rejects.toThrow(/InvalidCaller/);
        });
    });

    describe("TestSetAndRemovePermission", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        let accountAddress: string;
        let appointeeAddress: string;
        let target: string;
        let selector: string; // bytes4 selector


        // signer = new ethers.Wallet(testUtils.ANVIL_FIRST_PRIVATE_KEY!, provider);

        // Addresses
        accountAddress = testUtils.ANVIL_FIRST_ADDRESS!;
        appointeeAddress = testUtils.ANVIL_SECOND_ADDRESS!;
        target = testUtils.ANVIL_THIRD_ADDRESS!;
        selector = "0x00010203"; // bytes4

        test("set permission to account", async () => {
            const receipt = await client0.elWriter.setPermission({
                accountAddress,
                appointeeAddress,
                target,
                selector,
            });
            expect(receipt.status).toBe(1n);

            const canCall = await client0.elReader.canCall(accountAddress, appointeeAddress, target, selector);
            expect(canCall).toBe(true);
        });

        test("set permission to account when already set", async () => {
            await expect(
                client0.elWriter.setPermission({
                    accountAddress,
                    appointeeAddress,
                    target,
                    selector,
                })
            ).rejects.toThrow(/AppointeeAlreadySet/);
        });

        test("remove permission from account", async () => {
            const receipt = await client0.elWriter.removePermission({
                accountAddress,
                appointeeAddress,
                target,
                selector,
            });
            expect(receipt.status).toBe(1n);

            const canCall = await client0.elReader.canCall(accountAddress, appointeeAddress, target, selector);
            expect(canCall).toBe(false);
        });

        test("remove permission from account when not set", async () => {
            await expect(
                client0.elWriter.removePermission({
                    accountAddress,
                    appointeeAddress,
                    target,
                    selector,
                })
            ).rejects.toThrow(/AppointeeNotSet/);
        });
    });

    describe("TestModifyAllocations", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        const operatorAddr = testUtils.ANVIL_FIRST_ADDRESS!;
        const strategyAddr = contractAddrs.erc20MockStrategy;
        const avsAddr = contractAddrs.serviceManager;

        test("should enforce allocation delay before modifying allocations", async () => {
            const operatorSetId = 1n;
            const newAllocation = 100n;

            // Attempt without delay init should fail
            await expect(
                client0.elWriter.modifyAllocations(
                    operatorAddr,
                    avsAddr,
                    operatorSetId,
                    [strategyAddr],
                    [newAllocation]
                )
            ).rejects.toThrow(/UninitializedAllocationDelay/);

            // Initialize allocation delay
            const delay = 1n;
            const receipt1 = await client0.elWriter.setAllocationDelay(operatorAddr, delay);
            expect(receipt1.status).toBe(1n);

            // Advance chain by ALLOCATION_CONFIGURATION_DELAY
            const allocationConfigurationDelay = 1200;
            await testUtils.advanceChainByNBlocksExecInContainer(allocationConfigurationDelay + 1, container);
            // Touch the chainReader to apply delay
            await client0.elReader.getAllocationDelay(operatorAddr);

            // Must create operator set first
            await createTotalStakeOperatorSet(client0, strategyAddr);

            // Now modify allocations
            const receipt2 = await client0.elWriter.modifyAllocations(
                operatorAddr,
                avsAddr,
                operatorSetId,
                [strategyAddr],
                [newAllocation]
            );
            expect(receipt2.status).toBe(1n);

            // Verify pending diff set, current magnitude = 0
            let allocationInfo = await client0.elReader.getAllocationInfo(operatorAddr, strategyAddr);
            expect(allocationInfo[0].pendingDiff).toBe(newAllocation);
            expect(allocationInfo[0].currentMagnitude).toBe(0n);

            // Retrieve allocation delay and advance chain by it
            const allocationDelay = await client0.elReader.getAllocationDelay(operatorAddr);
            await testUtils.advanceChainByNBlocksExecInContainer(Number(allocationDelay), container);

            // Verify allocation updated
            allocationInfo = await client0.elReader.getAllocationInfo(operatorAddr, strategyAddr);
            expect(allocationInfo[0].currentMagnitude).toBe(newAllocation);
        });
    });

    describe("TestClearDeallocationQueue", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];

        const operatorAddr = testUtils.ANVIL_FIRST_ADDRESS;
        const strategyAddr = contractAddrs.erc20MockStrategy;
        const avsAddr = contractAddrs.serviceManager;
        const operatorSetId = 1n;

        test("should clear deallocation queue correctly", async () => {
            const newAllocation = 100n;
            const delay = 1n;

            // Initialize allocation delay
            let receipt = await client0.elWriter.setAllocationDelay(operatorAddr, delay);
            expect(receipt.status).toBe(1n);

            // Advance chain so allocation delay can apply
            const allocationConfigurationDelay = 1200;
            await testUtils.advanceChainByNBlocksExecInContainer(allocationConfigurationDelay + 1, container);

            // Trigger GetAllocationDelay to finalize delay application
            await client0.elReader.getAllocationDelay(operatorAddr);

            // Create operator set
            await createTotalStakeOperatorSet(client0, strategyAddr);

            // Modify allocations
            receipt = await client0.elWriter.modifyAllocations(
                operatorAddr,
                avsAddr,
                operatorSetId,
                [strategyAddr],
                [newAllocation]
            );
            expect(receipt.status).toBe(1n);

            // Check pending allocation
            let allocationInfo = await client0.elReader.getAllocationInfo(operatorAddr, strategyAddr);
            let pendingDiff = allocationInfo[0].pendingDiff;
            expect(pendingDiff).toBe(newAllocation);
            expect(allocationInfo[0].currentMagnitude).toBe(0n);

            // Clear deallocation queue
            const strategies = [strategyAddr];
            const numsToClear = [1n];
            receipt = await client0.elWriter.clearDeallocationQueue(operatorAddr, strategies, numsToClear);
            expect(receipt.status).toBe(1n);

            // Check that allocation was completed
            allocationInfo = await client0.elReader.getAllocationInfo(operatorAddr, strategyAddr);
            expect(allocationInfo[0].currentMagnitude).toBe(newAllocation);

            // Fails if strategies and numsToClear have different lengths
            const invalidNumsToClear: Uint16[] = [];
            await expect(
                client0.elWriter.clearDeallocationQueue(operatorAddr, strategies, invalidNumsToClear)
            ).rejects.toThrow(/InputArrayLengthMismatch/); // error: 0x43714afd
        });
    }, { timeout: 10000 });

    describe("TestAddAndRemovePendingAdmin", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];
        const { elReader, elWriter } = client0;

        let operatorAddr: string = testUtils.ANVIL_FIRST_ADDRESS;
        let pendingAdmin: string = testUtils.ANVIL_THIRD_ADDRESS;

        test("should fail to remove pending admin when not added", async () => {
            await expect(
                elWriter.removePendingAdmin({
                    accountAddress: operatorAddr,
                    adminAddress: pendingAdmin,
                })
            ).rejects.toThrow(/AdminNotPending/);
        });

        test("should add pending admin", async () => {
            const receipt = await elWriter.addPendingAdmin({
                accountAddress: operatorAddr,
                adminAddress: pendingAdmin,
            });

            expect(receipt.status).toBe(1n);

            const isPendingAdmin = await elReader.isPendingAdmin(operatorAddr, pendingAdmin);
            expect(isPendingAdmin).toBe(true);
        });

        test("should fail to add pending admin when already added", async () => {
            await expect(
                elWriter.addPendingAdmin({
                    accountAddress: operatorAddr,
                    adminAddress: pendingAdmin,
                })
            ).rejects.toThrow(/AdminAlreadyPending/);
        });

        test("should remove pending admin", async () => {
            const receipt = await elWriter.removePendingAdmin({
                accountAddress: operatorAddr,
                adminAddress: pendingAdmin,
            });

            expect(receipt.status).toBe(1n);

            const isPendingAdmin = await elReader.isPendingAdmin(operatorAddr, pendingAdmin);
            expect(isPendingAdmin).toBe(false);
        });
    });

    describe("TestAcceptAdmin", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];
        const { elReader, elWriter } = client0;

        let accountChainWriter: Clients = await buildSingleClient(testUtils.ANVIL_FIRST_PRIVATE_KEY, endpoint);
        let adminChainWriter: Clients = await buildSingleClient(testUtils.ANVIL_SECOND_PRIVATE_KEY, endpoint)

        let accountAddr: string = testUtils.ANVIL_FIRST_ADDRESS;
        let pendingAdminAddr: string = testUtils.ANVIL_SECOND_ADDRESS;

        beforeAll(async () => {
            // Add pending admin first
            const addRequest = {
                accountAddress: accountAddr,
                adminAddress: pendingAdminAddr,
            };

            const receipt = await accountChainWriter.elWriter.addPendingAdmin(addRequest);
            expect(receipt.status).toBe(1n);
        });

        test("should accept admin", async () => {
            const acceptRequest = {
                accountAddress: accountAddr,
            };

            const receipt = await adminChainWriter.elWriter.acceptAdmin(acceptRequest);
            expect(receipt.status).toBe(1n);

            const isAdmin = await elReader.isAdmin(accountAddr, pendingAdminAddr);
            expect(isAdmin).toBe(true);
        });

        test("should fail to accept admin when already accepted", async () => {
            const acceptRequest = {
                accountAddress: accountAddr,
            };

            await expect(
                adminChainWriter.elWriter.acceptAdmin(acceptRequest)
            ).rejects.toThrow(/AdminNotPending/);
        });
    });

    describe("TestRemoveAdmin", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { container, endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];
        const { elReader, elWriter } = client0;

        let accountChainWriter: Clients = await buildSingleClient(testUtils.ANVIL_FIRST_PRIVATE_KEY, endpoint);
        let admin1ChainWriter: Clients = await buildSingleClient(testUtils.ANVIL_SECOND_PRIVATE_KEY, endpoint);
        let admin2ChainWriter: Clients = await buildSingleClient(testUtils.ANVIL_THIRD_PRIVATE_KEY, endpoint);

        let accountAddr: string = testUtils.ANVIL_FIRST_ADDRESS;
        let admin1: string = testUtils.ANVIL_SECOND_ADDRESS;
        let admin2: string = testUtils.ANVIL_THIRD_ADDRESS;

        beforeAll(async () => {
            const addAdmin1Request = {
                accountAddress: accountAddr,
                adminAddress: admin1,
            };
            const addAdmin2Request = {
                accountAddress: accountAddr,
                adminAddress: admin2,
            };
            const acceptAdminRequest = {
                accountAddress: accountAddr,
            };

            // Add and accept admin 1
            let receipt = await accountChainWriter.elWriter.addPendingAdmin(addAdmin1Request);
            expect(receipt.status).toBe(1n);

            receipt = await admin1ChainWriter.elWriter.acceptAdmin(acceptAdminRequest);
            expect(receipt.status).toBe(1n);

            // Add and accept admin 2
            receipt = await admin1ChainWriter.elWriter.addPendingAdmin(addAdmin2Request);
            expect(receipt.status).toBe(1n);

            receipt = await admin2ChainWriter.elWriter.acceptAdmin(acceptAdminRequest);
            expect(receipt.status).toBe(1n);
        });

        test("should remove admin 2", async () => {
            const removeAdminRequest = {
                accountAddress: accountAddr,
                adminAddress: admin2,
            };

            const receipt = await admin1ChainWriter.elWriter.removeAdmin(removeAdminRequest);
            expect(receipt.status).toBe(1n);

            const isAdmin = await elReader.isAdmin(accountAddr, admin2);
            expect(isAdmin).toBe(false);
        });

        test("should fail to remove admin 2 when already removed", async () => {
            const removeAdminRequest = {
                accountAddress: accountAddr,
                adminAddress: admin2,
            };

            await expect(
                admin1ChainWriter.elWriter.removeAdmin(removeAdminRequest)
            ).rejects.toThrow(/CannotHaveZeroAdmins/);
        });
    });

    describe("TestProcessClaim", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];
        const { elReader, elWriter } = client0;

        test("should process a claim successfully", async () => {
            const activationDelay = 0n;
            const receipt = await sendContractCall({
                contract: elWriter.rewardsCoordinator,
                method: "setActivationDelay",
                params: [activationDelay],
                pkWallet: client0.pkWallet,
                web3: client0.ethHttpClient,
            });
            expect(receipt.status).toBe(1n);

            // Make a test claim (stubbed - depends on your contract)
            const cumulativeEarnings = 42n;
            const recipient = testUtils.ANVIL_FIRST_ADDRESS;

            // In Go, `newTestClaim` builds a claim struct. Here you’d encode similarly:
            const claim: ClaimCheckParams = await newTestClaim(elReader, endpoint, cumulativeEarnings, testUtils.ANVIL_FIRST_PRIVATE_KEY);

            // Call processClaim
            const claimReceipt = await elWriter.processClaim(
                claim,
                recipient,
            );
            expect(claimReceipt.status).toBe(1n);
        });
    }, { timeout: 30_000 });

    describe("TestProcessClaims", async () => {
        const testConfigs = testUtils.getDefaultTestConfig();
        const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        const { clients, addresses: contractAddrs } = await buildClients(endpoint);
        const client0 = clients[0];
        const { elReader, elWriter } = client0;

        test("should process multiple claims successfully", async () => {
            const privateKeyHex = testUtils.ANVIL_FIRST_PRIVATE_KEY;

            const activationDelay = 0n;
            // Set activation delay to zero so claims can be processed immediately
            let receipt = await setTestRewardsCoordinatorActivationDelay(endpoint, privateKeyHex, activationDelay);
            expect(receipt.status).toEqual(1n); // ReceiptStatusSuccessful

            const recipient = testUtils.ANVIL_FIRST_ADDRESS;

            const cumulativeEarnings1 = 42n;
            const cumulativeEarnings2 = 4256n;

            // TODO (STA): eigensdk-go test bug. this tx not throwing any error
            // // Try empty claims
            // const emptyClaims:ClaimCheckParams[] = [];
            // await expect(
            //     elWriter.processClaims(emptyClaims, recipient)
            // ).rejects.toThrow("cannot process empty claims");

            // Generate 2 claims
            const claim1 = await newTestClaim(elReader, endpoint, cumulativeEarnings1, privateKeyHex);
            const claim2 = await newTestClaim(elReader, endpoint, cumulativeEarnings2, privateKeyHex);

            const claims = [claim1, claim2];
            receipt = await elWriter.processClaims(claims, recipient);

            expect(receipt.status).toEqual(1n); // ReceiptStatusSuccessful
        });
    }, { timeout: 30_000 });

    // Creates an operator set with a single strategy. Note that operator set Id will be
    // defined sequentially (as the new amount of operator sets minus one)
    async function createTotalStakeOperatorSet(
        clients: Clients,
        erc20MockStrategyAddr: string,
    ): Promise<TransactionReceipt> {
        const waitForReceipt = true;

        const operatorSetParam: OperatorSetParams = {
            maxOperatorCount: 10n,
            kickBIPsOfOperatorStake: 100n,
            kickBIPsOfTotalStake: 1000n,
        };

        const minimumStake = 1n;

        const strategyParams: StrategyParams = {
            strategy: erc20MockStrategyAddr,
            multiplier: 1n,
        };

        const strategyParamsArray = [strategyParams];

        return await clients.avsRegistryWriter.createTotalDelegatedStakeQuorum(
            operatorSetParam,
            minimumStake,
            strategyParamsArray
        );
    }

    // Sets the testing RewardsCoordinator's activationDelay.
    // This is useful to test ChainWriter setter functions that depend on activationDelay.
    async function setTestRewardsCoordinatorActivationDelay(
        httpEndpoint: string,
        privateKeyHex: string,
        activationDelay: Uint32,
    ): Promise<TransactionReceipt> {
        const client: Clients = await buildSingleClient(privateKeyHex, httpEndpoint);
        return await sendContractCall({
            contract: client.elWriter.rewardsCoordinator,
            method: "setActivationDelay",
            params: [activationDelay],
            pkWallet: client.pkWallet,
            web3: client.ethHttpClient,
            abi: ABIs.REWARDS_COORDINATOR_ABI
        })
    }

    // TODO: need to reform buildClient with invalid ContractAddresses
    // TestInvalidConfig tests the behavior of the chainWriter when the config is invalid (e.g. missing addresses)
    // describe("TestInvalidConfigChainWriter", async () => {
        // const testConfigs = testUtils.getDefaultTestConfig();
        // const { endpoint } = await testUtils.startAnvilContainer(testConfigs.anvilStateFileName);

        // const ADDR_ZERO = "0x" + "00".repeat(20);
        // const invalidAddresses: testUtils.ContractAddresses = {
        //     registryCoordinator: ADDR_ZERO,
        //     operatorStateRetriever: ADDR_ZERO,
        //     rewardsCoordinator: ADDR_ZERO,
        //     permissionController: ADDR_ZERO,
        //     serviceManager: ADDR_ZERO,
        //     allocationManager: ADDR_ZERO,
        //     delegationManager: ADDR_ZERO,
        //     avsAddress: ADDR_ZERO,
        //     erc20MockStrategy: ADDR_ZERO,
        // }
        // const clients0 = await buildSingleClient(testUtils.ANVIL_FIRST_PRIVATE_KEY, endpoint, invalidAddresses);
        // const { elReader, elWriter } = clients0;

        // const operatorAddr = testUtils.ANVIL_FIRST_ADDRESS;

        // const operator: Operator = {
        //     address: operatorAddr,
        //     earningsReceiverAddress: operatorAddr,
        //     metadataUrl: "http://localhost/",
        //     allocationDelay: 0n,
        //     delegationApproverAddress: operatorAddr
        // };

        // test("register as operator", async () => {
        //     await expect(
        //         elWriter.registerAsOperator(operator)
        //     ).rejects.toThrow();
        // });

        // test("update operator details", async () => {
        //     await expect(
        //         elWriter.updateOperatorDetails(operator)
        //     ).rejects.toThrow();
        // });

        // test("update metadata URI", async () => {
        //     await expect(
        //         elWriter.updateMetadataUri(testUtils.ANVIL_FIRST_ADDRESS, "https://0.0.0.0")
        //     ).rejects.toThrow();
        // });

        // test("deposit erc20 into strategy", async () => {
        //     await expect(
        //         chainWriter.DepositERC20IntoStrategy(contractAddrs.Erc20MockStrategy, 1n, true)
        //     ).rejects.toThrow();
        // });

        // test("set claimer for", async () => {
        //     await expect(chainWriter.SetClaimerFor(ANVIL_FIRST_ADDRESS, true)).rejects.toThrow();
        // });

        // test("process claim and process claims", async () => {
        //     const rewardsCoordinatorAddr = contractAddrs.RewardsCoordinator;
        //     const config = {
        //         DelegationManagerAddress: contractAddrs.DelegationManager,
        //         RewardsCoordinatorAddress: rewardsCoordinatorAddr,
        //     };
        //     const chainReader = await NewTestChainReaderFromConfig(anvilHttpEndpoint, config);

        //     const receipt = await setTestRewardsCoordinatorActivationDelay(
        //         anvilHttpEndpoint,
        //         ANVIL_FIRST_PRIVATE_KEY,
        //         0
        //     );
        //     expect(receipt.status).toEqual(1);

        //     const claim = await newTestClaim(chainReader, anvilHttpEndpoint, 42n, ANVIL_FIRST_PRIVATE_KEY);

        //     await expect(chainWriter.ProcessClaim(claim, ANVIL_FIRST_ADDRESS, true)).rejects.toThrow();
        //     await expect(
        //         chainWriter.ProcessClaims([claim] as IRewardsCoordinatorTypesRewardsMerkleClaim[], ANVIL_FIRST_ADDRESS, true)
        //     ).rejects.toThrow();
        // });

        // test("set operator AVS split", async () => {
        //     await expect(
        //         chainWriter.SetOperatorAVSSplit(operatorAddr, ANVIL_FIRST_ADDRESS, 1, true)
        //     ).rejects.toThrow();
        // });

        // test("set operator PI split", async () => {
        //     await expect(chainWriter.SetOperatorPISplit(operatorAddr, 1, true)).rejects.toThrow();
        // });

        // test("modify allocations", async () => {
        //     const allocateParams = [
        //         {
        //             OperatorSet: { Avs: ANVIL_FIRST_ADDRESS, Id: 1 },
        //             Strategies: [contractAddrs.Erc20MockStrategy],
        //             NewMagnitudes: [100],
        //         },
        //     ];
        //     await expect(
        //         chainWriter.ModifyAllocations(operatorAddr, allocateParams, true)
        //     ).rejects.toThrow();
        // });

        // test("clear deallocation queue", async () => {
        //     await expect(
        //         chainWriter.ClearDeallocationQueue(operatorAddr, [contractAddrs.Erc20MockStrategy], [1], true)
        //     ).rejects.toThrow();
        // });

        // test("set allocation delay", async () => {
        //     await expect(chainWriter.SetAllocationDelay(operatorAddr, 0, true)).rejects.toThrow();
        // });

        // test("deregister from operator sets", async () => {
        //     const req: DeregistrationRequest = {
        //         AVSAddress: ANVIL_FIRST_ADDRESS,
        //         OperatorSetIds: [1],
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.DeregisterFromOperatorSets(operatorAddr, req)).rejects.toThrow();
        // });

        // test("register for operator sets", async () => {
        //     const req: RegistrationRequest = {
        //         OperatorAddress: ANVIL_SECOND_ADDRESS,
        //         AVSAddress: ANVIL_FIRST_ADDRESS,
        //         OperatorSetIds: [1],
        //         WaitForReceipt: true,
        //         Socket: "socket",
        //         BlsKeyPair: "0x01", // stub, replace with actual BLS key handling
        //     };
        //     await expect(chainWriter.RegisterForOperatorSets(operatorAddr, req)).rejects.toThrow();
        // });

        // test("remove permission", async () => {
        //     const req: RemovePermissionRequest = {
        //         AccountAddress: ANVIL_FIRST_ADDRESS,
        //         AppointeeAddress: ANVIL_SECOND_ADDRESS,
        //         Target: ANVIL_THIRD_ADDRESS,
        //         Selector: "0x00010203",
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.RemovePermission(req)).rejects.toThrow();
        // });

        // test("set permission", async () => {
        //     const req: SetPermissionRequest = {
        //         AccountAddress: ANVIL_FIRST_ADDRESS,
        //         AppointeeAddress: ANVIL_SECOND_ADDRESS,
        //         Target: ANVIL_THIRD_ADDRESS,
        //         Selector: "0x00010203",
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.SetPermission(req)).rejects.toThrow();
        // });

        // test("accept admin", async () => {
        //     const req: AcceptAdminRequest = {
        //         AccountAddress: ANVIL_FIRST_ADDRESS,
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.AcceptAdmin(req)).rejects.toThrow();
        // });

        // test("add pending admin", async () => {
        //     const req: AddPendingAdminRequest = {
        //         AccountAddress: ANVIL_FIRST_ADDRESS,
        //         AdminAddress: ANVIL_SECOND_ADDRESS,
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.AddPendingAdmin(req)).rejects.toThrow();
        // });

        // test("remove admin", async () => {
        //     const req: RemoveAdminRequest = {
        //         AccountAddress: ANVIL_FIRST_ADDRESS,
        //         AdminAddress: ANVIL_THIRD_ADDRESS,
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.RemoveAdmin(req)).rejects.toThrow();
        // });

        // test("remove pending admin", async () => {
        //     const req: RemovePendingAdminRequest = {
        //         AccountAddress: operatorAddr,
        //         AdminAddress: "0x009440d62dc85c73dbf889b7ad1f4da8b231d2ef",
        //         WaitForReceipt: true,
        //     };
        //     await expect(chainWriter.RemovePendingAdmin(req)).rejects.toThrow();
        // });
    // });

    // Returns a (test) claim for the given cumulativeEarnings, whose earner is
    // the account given by the testUtils.ANVIL_FIRST_ADDRESS address.
    async function newTestClaim(
        elReader: ELReader,
        rpcEndpoint: string,
        cumulativeEarnings: Uint256,
        privateKeyHex: string,
    ): Promise<ClaimCheckParams> {
        const web3 = new Web3(new Web3.providers.HttpProvider(rpcEndpoint));
        const clients: Clients = await buildSingleClient(privateKeyHex, rpcEndpoint);
        const pkWallet = clients.pkWallet;

        const contractAddrs = await testUtils.getContractAddressesFromContractRegistry(rpcEndpoint);
        const mockStrategyAddr = contractAddrs.erc20MockStrategy;
        const rewardsCoordinatorAddr = contractAddrs.rewardsCoordinator;

        // const contractStrategy = await strategy.newContractIStrategy(mockStrategyAddr, provider);
        const contractStrategy = new web3.eth.Contract(
            ABIs.I_STRATEGY_ABI as AbiItem[],
            contractAddrs.erc20MockStrategy
        );

        const tokenAddr: string = await contractStrategy.methods.underlyingToken({}).call();

        const token = new web3.eth.Contract(
            ABIs.IERC20_ABI as AbiItem[],
            tokenAddr
        );

        // Mint tokens for the RewardsCoordinator
        const receiptMint = await sendContractCall({
            contract: token,
            method: "mint",
            params: [rewardsCoordinatorAddr, cumulativeEarnings],
            pkWallet,
            web3,
        });
        expect(receiptMint.status).toBe(1n)

        // Generate token tree leaf
        const earnerAddr = testUtils.ANVIL_FIRST_ADDRESS;
        const tokenLeaf = {
            token: tokenAddr,
            cumulativeEarnings: cumulativeEarnings,
        };
        const tokenLeafSalt = 1;

        // Write the BigNumber to a 32-byte sized buffer to match the uint256 length
        const cumulativeEarningsBytes = tokenLeaf.cumulativeEarnings.toString(16).padStart(64, "0");

        let encodedTokenLeaf = new Uint8Array([
            tokenLeafSalt,
            ...arrayify(tokenAddr),
            ...arrayify(cumulativeEarningsBytes),
        ]);

        // Hash token tree leaf to get root
        const earnerTokenRoot = ethers.keccak256(encodedTokenLeaf);

        // Generate earner tree leaf
        const earnerLeaf = {
            earner: earnerAddr,
            earnerTokenRoot: earnerTokenRoot,
        };

        // Encode earner leaf
        const earnerLeafSalt = 0;
        let encodedEarnerLeaf = new Uint8Array([
            earnerLeafSalt,
            ...arrayify(earnerLeaf.earner),
            ...arrayify(earnerLeaf.earnerTokenRoot),
        ]);

        // Hash encoded earner tree leaf to get root
        const earnerTreeRoot = ethers.keccak256(encodedEarnerLeaf);

        // Fetch the next root index from contract
        const nextRootIndex = await elReader.getDistributionRootsLength();

        const tokenLeaves = [tokenLeaf];

        // Construct the claim
        const claim: ClaimCheckParams = {
            rootIndex: nextRootIndex,
            earnerIndex: 0n,
            earnerTreeProof: "0x",
            earnerLeaf,
            tokenIndices: [0n],
            tokenTreeProofs: ["0x"],
            tokenLeaves,
        };

        const root = arrayify(earnerTreeRoot);

        // Fetch the current timestamp to increase it
        const currRewardsCalculationEndTimestamp = await elReader.currRewardsCalculationEndTimestamp();

        const rewardsUpdater = testUtils.ANVIL_FIRST_ADDRESS;

        // Change the rewards updater to be able to submit the new root
        const setUpdaterTx = await sendContractCall({
            contract: clients.elWriter.rewardsCoordinator,
            method: "setRewardsUpdater",
            params: [rewardsUpdater],
            pkWallet,
            web3,
        });

        const submitRootTx = await sendContractCall({
            contract: clients.elWriter.rewardsCoordinator,
            method: "submitRoot",
            params: [
                root,
                currRewardsCalculationEndTimestamp + 1n
            ],
            pkWallet,
            web3,
        });

        return claim;
    }

});