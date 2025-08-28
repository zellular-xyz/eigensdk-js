import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { BuildAllConfig, Clients, buildAll } from "../chainio/clients/builder";
import { getContractAddressesFromContractRegistry } from "./utils/anvil.js";
import { ContractAddresses } from "../types/general.js";

export type TestConfigs = {
    operator_address_1: string;
    operator_address_2: string;
    operator_address_3: string;

    eth_rpc_url: string;
    eth_ws_url: string;

    ecdsa_private_key_1: string;
    ecdsa_private_key_2: string;

    ecdsa_private_key_3: string;

    ecdsa_private_key_store_path: string;
    // [key: string]: any,
};

// Read and parse the YAML configuration file
const config: TestConfigs = yaml.load(
    fs.readFileSync(path.resolve(__dirname, "./config/anvil.yaml"), "utf8"),
) as TestConfigs;

async function buildClients(
    rpcEndpoint: string,
): Promise<{ clients: Clients[]; addresses: ContractAddresses }> {
    const addresses =
        await getContractAddressesFromContractRegistry(rpcEndpoint);

    const allConfigs = new BuildAllConfig({
        avsName: "incredible-squaring",
        ethHttpUrl: rpcEndpoint,
        registryCoordinatorAddr: addresses.registryCoordinator,
        operatorStateRetrieverAddr: addresses.operatorStateRetriever,
        rewardsCoordinatorAddr: addresses.rewardsCoordinator,
        permissionControllerAddr: addresses.permissionController!,
        serviceManagerAddr: addresses.serviceManager,
        allocationManagerAddr: addresses.allocationManager,
        delegationManagerAddr: addresses.delegationManager,
    });
    // Build array of Clients instances
    const clients: Clients[] = [];
    for (let i = 0; i < 3; i++) {
        clients.push(
            await buildAll(allConfigs, config[`ecdsa_private_key_${i + 1}`]),
        );
    }

    return { clients, addresses };
}

export async function buildSingleClient(
    privateKey: string,
    rpcEndpoint: string,
    addresses?: ContractAddresses,
): Promise<Clients> {
    if (!addresses) {
        addresses = await getContractAddressesFromContractRegistry(rpcEndpoint);
    }

    const allConfigs = new BuildAllConfig({
        avsName: "incredible-squaring",
        // ethHttpUrl: config.eth_rpc_url,
        ethHttpUrl: rpcEndpoint,
        registryCoordinatorAddr: addresses.registryCoordinator,
        operatorStateRetrieverAddr: addresses.operatorStateRetriever,
        rewardsCoordinatorAddr: addresses.rewardsCoordinator,
        permissionControllerAddr: addresses.permissionController!,
        serviceManagerAddr: addresses.serviceManager,
        allocationManagerAddr: addresses.allocationManager,
        delegationManagerAddr: addresses.delegationManager,
    });

    return await buildAll(allConfigs, privateKey);
}

export { config, buildClients };
