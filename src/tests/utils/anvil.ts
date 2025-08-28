import { ethers } from "ethers";
import { GenericContainer, TestContainer, Wait } from "testcontainers";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import * as ABIs from "../../contracts/ABIs";
import { ContractAddresses } from "../../types/general.js";

// Promisify exec for async command execution
const execAsync = promisify(exec);

// Constants for Anvil addresses and private keys
export const ANVIL_FIRST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const ANVIL_FIRST_PRIVATE_KEY =
    "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const ANVIL_SECOND_ADDRESS =
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const ANVIL_SECOND_PRIVATE_KEY =
    "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const ANVIL_THIRD_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
export const ANVIL_THIRD_PRIVATE_KEY =
    "5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

// Minimal ABI for ContractsRegistry contract
const contractsRegistryAbi = [
    "function contracts(string name) public view returns (address)",
];

// Address of the ContractsRegistry contract
const CONTRACTS_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Interface for TestConfig (equivalent to Go struct)
export interface TestConfig {
    anvilStateFileName: string;
    logLevel: string; // Simplified from slog.Level, using string for simplicity
}

// Default test configuration
export function getDefaultTestConfig(): TestConfig {
    return {
        anvilStateFileName: "contracts-deployed-anvil-state.json",
        logLevel: "debug",
    };
}

// Start Anvil container (generic or M2-specific based on isM2 flag)
export async function startAnvilContainer(
    anvilStateFileName: string = "",
    isM2: boolean = false,
): Promise<{ container: GenericContainer; endpoint: string }> {
    try {
        const container = new GenericContainer(
            "ghcr.io/foundry-rs/foundry:stable",
        )
            .withEntrypoint(["anvil"])
            .withCommand([
                "--host",
                "0.0.0.0",
                "--base-fee",
                "0",
                "--gas-price",
                "0",
            ])
            // .withExposedPorts({ container: 8545, host: 8545 })
            .withExposedPorts(8545)
            .withWaitStrategy(Wait.forLogMessage("Listening on", 1));

        if (anvilStateFileName) {
            console.log(
                `Starting Anvil container with state file: ${anvilStateFileName}`,
            );
            container.withCommand([
                "--host",
                "0.0.0.0",
                "--base-fee",
                "0",
                "--gas-price",
                "0",
                "--load-state",
                "/mnt/state.json",
            ]);

            // Resolve the state file path relative to the current file
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const stateFilePath = path.join(
                __dirname,
                "..",
                "..",
                isM2 ? "M2-contracts/anvil" : "contracts/anvil",
                anvilStateFileName,
            );

            container.withCopyFilesToContainer([
                {
                    source: stateFilePath,
                    target: "/mnt/state.json",
                    mode: 0o644, // FileMode 0644
                },
            ]);
        }

        const startedContainer = await container.start();
        const endpoint = `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8545)}`;

        // Advance chain by 1 block if state file is used (to avoid issues with empty transactions)
        // See https://github.com/foundry-rs/foundry/issues/8213
        if (anvilStateFileName) {
            await advanceChainByNBlocksExecInContainer(1, startedContainer);
        }

        return { container: startedContainer, endpoint };
    } catch (error: any) {
        throw new Error(`Failed to start Anvil container: ${error.message}`);
    }
}

// Wrapper for M2-specific Anvil container
export async function startM2AnvilContainer(
    anvilStateFileName: string = "",
): Promise<{ container: any; endpoint: string }> {
    return startAnvilContainer(anvilStateFileName, true);
}

// Get contract addresses from ContractsRegistry (generic or M2-specific based on isM2 flag)
export async function getContractAddressesFromContractRegistry(
    ethHttpUrl: string,
    isM2: boolean = false,
): Promise<ContractAddresses> {
    try {
        const provider = new ethers.JsonRpcProvider(ethHttpUrl);
        const contractsRegistry = new ethers.Contract(
            CONTRACTS_REGISTRY_ADDRESS,
            contractsRegistryAbi,
            provider,
        );

        const mockAvsServiceManagerAddr = await contractsRegistry.contracts(
            "mockAvsServiceManager",
        );
        if (mockAvsServiceManagerAddr === ethers.ZeroAddress) {
            throw new Error("mockAvsServiceManagerAddr is empty");
        }

        const mockAvsRegistryCoordinatorAddr =
            await contractsRegistry.contracts("mockAvsRegistryCoordinator");
        if (mockAvsRegistryCoordinatorAddr === ethers.ZeroAddress) {
            throw new Error("mockAvsRegistryCoordinatorAddr is empty");
        }

        const mockAvsOperatorStateRetrieverAddr =
            await contractsRegistry.contracts("mockAvsOperatorStateRetriever");
        if (mockAvsOperatorStateRetrieverAddr === ethers.ZeroAddress) {
            throw new Error("mockAvsOperatorStateRetrieverAddr is empty");
        }

        const delegationManagerAddr =
            await contractsRegistry.contracts("delegationManager");
        if (delegationManagerAddr === ethers.ZeroAddress) {
            throw new Error("delegationManagerAddr is empty");
        }

        const erc20MockStrategyAddr =
            await contractsRegistry.contracts("erc20MockStrategy");
        if (erc20MockStrategyAddr === ethers.ZeroAddress) {
            throw new Error("erc20MockStrategyAddr is empty");
        }

        const rewardsCoordinatorAddr =
            await contractsRegistry.contracts("rewardsCoordinator");
        if (rewardsCoordinatorAddr === ethers.ZeroAddress) {
            throw new Error("rewardsCoordinatorAddr is empty");
        }

        const registryCoordinator = new ethers.Contract(
            mockAvsRegistryCoordinatorAddr,
            ABIs.REGISTRY_COORDINATOR_ABI,
            provider,
        );

        const contractAddresses: ContractAddresses = {
            allocationManager: await registryCoordinator.allocationManager(),
            serviceManager: mockAvsServiceManagerAddr,
            registryCoordinator: mockAvsRegistryCoordinatorAddr,
            operatorStateRetriever: mockAvsOperatorStateRetrieverAddr,
            delegationManager: delegationManagerAddr,
            erc20MockStrategy: erc20MockStrategyAddr,
            rewardsCoordinator: rewardsCoordinatorAddr,
            avsAddress: await registryCoordinator.avs(),
        };

        if (!isM2) {
            const permissionControllerAddr = await contractsRegistry.contracts(
                "permissionController",
            );
            if (permissionControllerAddr === ethers.ZeroAddress) {
                throw new Error("permissionControllerAddr is empty");
            }
            contractAddresses.permissionController = permissionControllerAddr;
        }

        return contractAddresses;
    } catch (error: any) {
        throw new Error(`Failed to get contract addresses: ${error.message}`);
    }
}

// Wrapper for M2-specific contract addresses
export async function getM2ContractAddressesFromContractRegistry(
    ethHttpUrl: string,
): Promise<ContractAddresses> {
    return getContractAddressesFromContractRegistry(ethHttpUrl, true);
}

// Advance chain by N blocks using cast command
export async function advanceChainByNBlocks(
    n: number,
    anvilEndpoint: string,
): Promise<void> {
    try {
        const { stdout, stderr } = await execAsync(
            `cast rpc anvil_mine ${n} --rpc-url ${anvilEndpoint}`,
        );
        if (stderr) {
            throw new Error(`Error in cast command: ${stderr}`);
        }
        console.log(stdout);
    } catch (error) {
        throw new Error(
            `Failed to advance chain by ${n} blocks: ${error.message}`,
        );
    }
}

// Advance chain by N blocks inside the container
export async function advanceChainByNBlocksExecInContainer(
    n: number,
    container: any,
): Promise<void> {
    try {
        // @ts-ignore
        const { exitCode, output } = await container.exec([
            "cast",
            "rpc",
            "anvil_mine",
            `${n}`,
            "--rpc-url",
            "http://localhost:8545",
        ]);
        if (exitCode !== 0) {
            throw new Error(
                `Unable to advance anvil chain by ${n} blocks. Exit code: ${exitCode}, Output: ${output}`,
            );
        }
    } catch (error: any) {
        throw new Error(
            `Failed to advance chain by ${n} blocks in container: ${error.message}`,
        );
    }
}
