import { createPublicClient, createWalletClient, http, defineChain, parseGwei, keccak256, toBytes, toHex, pad, toEventSelector, numberToHex, zeroAddress, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SDK } from "@somnia-chain/reactivity";

const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://dream-rpc.somnia.network/"] },
  },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: "https://shannon-explorer.somnia.network/" },
  },
  testnet: true,
});

// ERC-20 Transfer(address,address,uint256) event selector
const TRANSFER_EVENT_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));

// Wildcard topic (bytes32(0)) — matches any value for that topic position
const WILDCARD = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Set PRIVATE_KEY in .env");

  const handlerAddress = process.env.NEXT_PUBLIC_WHALE_HANDLER_ADDRESS;
  if (!handlerAddress) throw new Error("Set NEXT_PUBLIC_WHALE_HANDLER_ADDRESS in .env (deploy first)");

  const summaryAddress = process.env.NEXT_PUBLIC_WHALE_SUMMARY_ADDRESS;
  if (!summaryAddress) throw new Error("Set NEXT_PUBLIC_WHALE_SUMMARY_ADDRESS in .env (deploy first)");

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

  // 1. Subscribe WhaleHandler to ERC-20 Transfer events
  // SDK requires: either emitter OR eventTopics must be provided
  // We use eventTopics with Transfer selector + wildcards for from/to/unused
  // emitter is wildcarded (address(0)) so ALL ERC-20 contracts are watched
  console.log("1/3 Creating on-chain subscription for WhaleHandler (ERC-20 Transfer events)...");
  const handlerResult = await sdk.createSoliditySubscription({
    handlerContractAddress: handlerAddress as `0x${string}`,
    eventTopics: [TRANSFER_EVENT_TOPIC, WILDCARD, WILDCARD, WILDCARD],
    // emitter omitted = wildcard (all contracts)
    priorityFeePerGas: parseGwei("2"),
    maxFeePerGas: parseGwei("10"),
    gasLimit: 500_000n,
    isGuaranteed: true,
    isCoalesced: false,
  });
  if (handlerResult instanceof Error) throw new Error(`WhaleHandler subscription failed: ${handlerResult.message}`);
  console.log("   WhaleHandler subscription tx:", handlerResult);

  // 2. Subscribe WhaleSummary to WhaleAlert events from WhaleHandler
  // Uses emitter filter to only receive events from the WhaleHandler contract
  console.log("2/3 Creating on-chain subscription for WhaleSummary (WhaleAlert events)...");
  const summaryResult = await sdk.createSoliditySubscription({
    handlerContractAddress: summaryAddress as `0x${string}`,
    emitter: handlerAddress as `0x${string}`,
    // emitter is set, so eventTopics can be omitted (wildcard all events from this emitter)
    priorityFeePerGas: parseGwei("2"),
    maxFeePerGas: parseGwei("10"),
    gasLimit: 800_000n,
    isGuaranteed: true,
    isCoalesced: true, // batch multiple WhaleAlerts per block for efficiency
  });
  if (summaryResult instanceof Error) throw new Error(`WhaleSummary event subscription failed: ${summaryResult.message}`);
  console.log("   WhaleSummary event subscription tx:", summaryResult);

  // 3. Subscribe WhaleSummary to BlockTick for periodic summary finalization
  // NOTE: sdk.createOnchainBlockTickSubscription() has a validation bug (rejects precompile as emitter)
  // So we call the precompile directly via walletClient.writeContract
  console.log("3/3 Creating BlockTick subscription for WhaleSummary (periodic snapshots)...");

  const PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000100" as `0x${string}`;
  const blockTickSelector = toEventSelector({
    name: "BlockTick",
    type: "event",
    inputs: [{ type: "uint64", indexed: true, name: "blockNumber" }],
  });
  const onEventSelector = toFunctionSelector({
    name: "onEvent",
    type: "function",
    inputs: [
      { type: "address", name: "emitter" },
      { type: "bytes32[]", name: "eventTopics" },
      { type: "bytes", name: "data" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  });

  const precompileAbi = [
    {
      type: "function",
      name: "subscribe",
      inputs: [{
        name: "subscriptionData",
        type: "tuple",
        components: [
          { name: "eventTopics", type: "bytes32[4]" },
          { name: "origin", type: "address" },
          { name: "caller", type: "address" },
          { name: "emitter", type: "address" },
          { name: "handlerContractAddress", type: "address" },
          { name: "handlerFunctionSelector", type: "bytes4" },
          { name: "priorityFeePerGas", type: "uint64" },
          { name: "maxFeePerGas", type: "uint64" },
          { name: "gasLimit", type: "uint64" },
          { name: "isGuaranteed", type: "bool" },
          { name: "isCoalesced", type: "bool" },
        ],
      }],
      outputs: [{ name: "subscriptionId", type: "uint256" }],
      stateMutability: "nonpayable",
    },
  ] as const;

  const blockTickTx = await walletClient.writeContract({
    address: PRECOMPILE_ADDRESS,
    abi: precompileAbi,
    functionName: "subscribe",
    args: [{
      eventTopics: [blockTickSelector as `0x${string}`, WILDCARD, WILDCARD, WILDCARD],
      origin: zeroAddress,
      caller: zeroAddress,
      emitter: PRECOMPILE_ADDRESS,
      handlerContractAddress: summaryAddress as `0x${string}`,
      handlerFunctionSelector: onEventSelector as `0x${string}`,
      priorityFeePerGas: parseGwei("2"),
      maxFeePerGas: parseGwei("10"),
      gasLimit: 500_000n,
      isGuaranteed: false,
      isCoalesced: true,
    }],
  });
  console.log("   BlockTick subscription tx:", blockTickTx);

  console.log("\nAll 3 subscriptions created successfully!");
  console.log("- WhaleHandler: receives ERC-20 Transfer(address,address,uint256) events chain-wide");
  console.log("- WhaleSummary: accumulates WhaleAlert events from WhaleHandler");
  console.log("- WhaleSummary: finalizes summary window on each BlockTick");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
