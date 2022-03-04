import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
    PhantomWalletAdapter,
    SolletWalletAdapter
} from '@solana/wallet-adapter-wallets';
import {
    WalletModalProvider,
    WalletDisconnectButton,
    WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { SendOneLamportToRandomAddress } from './SendTransactionButton'
import './Wallet.css'

require('@solana/wallet-adapter-react-ui/styles.css');

export const Wallet = () => {
    const network = WalletAdapterNetwork.local;

    const endpoint = useMemo(() => clusterApiUrl(network), [network]);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolletWalletAdapter()
        ],
        [network]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <div className="connect-wallet-wrapper">
                        <WalletMultiButton />
                        <WalletDisconnectButton />
                    </div>
                    <SendOneLamportToRandomAddress />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
