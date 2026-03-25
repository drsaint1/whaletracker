import { createPublicClient, createWalletClient, http, defineChain, parseGwei, keccak256, toBytes, zeroAddress, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SDK } from "@somnia-chain/reactivity";

const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://dream-rpc.somnia.network/"] },
  },
  testnet: true,
});

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Set PRIVATE_KEY in .env");

  const handlerAddress = process.env.NEXT_PUBLIC_WHALE_HANDLER_ADDRESS;
  if (!handlerAddress) throw new Error("Set NEXT_PUBLIC_WHALE_HANDLER_ADDRESS in .env");

  const stormAddress = process.env.NEXT_PUBLIC_WHALE_STORM_ADDRESS;
  if (!stormAddress) throw new Error("Set NEXT_PUBLIC_WHALE_STORM_ADDRESS in .env");

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: somniaTestnet,
    transport: http(),
  });

  const sdk = new SDK({
    public: publicClient,
    wallet: walletClient,
  });

  // Subscribe WhaleStorm to WhaleAlert events from WhaleHandler
  console.log("Creating on-chain subscription: WhaleStorm <- WhaleAlert from WhaleHandler...");
  const result = await sdk.createSoliditySubscription({
    handlerContractAddress: stormAddress as `0x${string}`,
    emitter: handlerAddress as `0x${string}`,
    priorityFeePerGas: parseGwei("2"),
    maxFeePerGas: parseGwei("10"),
    gasLimit: 500_000n,
    isGuaranteed: true,
    isCoalesced: true,
  });

  if (result instanceof Error) throw new Error(`WhaleStorm subscription failed: ${result.message}`);
  console.log("WhaleStorm subscription tx:", result);
  console.log("\nWhaleStorm now reactively listens for WhaleAlert events from WhaleHandler!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
