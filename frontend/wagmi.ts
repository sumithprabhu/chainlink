import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia } from "wagmi/chains";
import { http } from "wagmi";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder";
const rpc = process.env.NEXT_PUBLIC_RPC_URL;

export const config = getDefaultConfig({
  appName: "SEAL",
  projectId: projectId as string,
  chains: [mainnet, sepolia],
  ssr: true,
  ...(rpc
    ? {
        transports: {
          [mainnet.id]: http(rpc),
          [sepolia.id]: http(rpc),
        },
      }
    : {}),
});
