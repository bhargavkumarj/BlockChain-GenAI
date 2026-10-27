"use client";

import { createConnector } from "wagmi";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  hexToBigInt,
  http,
  numberToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { RPC_URL, chain } from "@/lib/config";

const KEY = "pactum.guest.key";
const CONNECTED = "pactum.guest.connected";

function store() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readGuestKey(): Hex | undefined {
  const value = store()?.getItem(KEY);
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : undefined;
}

export function guestAddress(): Address | undefined {
  const key = readGuestKey();
  return key ? privateKeyToAccount(key).address : undefined;
}

/** Forget the guest key entirely. Funds held by it become unreachable — testnet only. */
export function forgetGuestKey() {
  store()?.removeItem(KEY);
  store()?.removeItem(CONNECTED);
}

/**
 * A zero-friction wallet: a key generated in the browser and kept in localStorage, so a visitor can try the
 * whole protocol without installing anything. Transactions are signed locally and sent straight to the RPC.
 * It is deliberately labelled as a testnet convenience in the UI.
 */
export function guestWallet() {
  return createConnector((config) => {
    const account = () => {
      let key = readGuestKey();
      if (!key) {
        key = generatePrivateKey();
        store()?.setItem(KEY, key);
      }
      return privateKeyToAccount(key);
    };
    const transport = http(RPC_URL);
    const walletClient = () => createWalletClient({ account: account(), chain, transport });
    const publicClient = createPublicClient({ chain, transport });

    const request = async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
      const p = (params ?? []) as unknown[];
      switch (method) {
        case "eth_chainId":
          return numberToHex(chain.id);
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account().address];
        case "eth_sendTransaction": {
          const tx = p[0] as { to?: Address; data?: Hex; value?: Hex; gas?: Hex };
          return walletClient().sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? hexToBigInt(tx.value) : undefined,
            gas: tx.gas ? hexToBigInt(tx.gas) : undefined,
          });
        }
        case "personal_sign":
          return account().signMessage({ message: { raw: p[0] as Hex } });
        case "eth_signTypedData_v4": {
          const typed = typeof p[1] === "string" ? JSON.parse(p[1]) : p[1];
          const types = { ...typed.types };
          delete types.EIP712Domain; // viem derives the domain type itself
          return account().signTypedData({ ...typed, types });
        }
        case "wallet_switchEthereumChain":
          return null;
        default:
          return publicClient.request({ method, params } as never);
      }
    };

    return {
      id: "guest",
      name: "Guest wallet",
      type: "guest",
      async connect(parameters) {
        const address = account().address;
        store()?.setItem(CONNECTED, "1");
        const accounts = parameters?.withCapabilities ? [{ address, capabilities: {} }] : [address];
        return { accounts: accounts as never, chainId: chain.id };
      },
      async disconnect() {
        store()?.removeItem(CONNECTED);
      },
      async getAccounts() {
        return readGuestKey() ? [account().address] : [];
      },
      async getChainId() {
        return chain.id;
      },
      async getProvider() {
        return { request };
      },
      async getClient() {
        return walletClient();
      },
      async isAuthorized() {
        return store()?.getItem(CONNECTED) === "1" && Boolean(readGuestKey());
      },
      async switchChain({ chainId }) {
        if (chainId !== chain.id) throw new Error(`Guest wallet only supports ${chain.name}`);
        return chain;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}
