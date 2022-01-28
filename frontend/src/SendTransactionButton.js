import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import React, { useCallback, useState } from 'react';

export const SendOneLamportToRandomAddress = () => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const onClick = useCallback(async () => {
        if (!publicKey) throw new WalletNotConnectedError();

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: new PublicKey("CMeDUSCcTq5WJfsFK78vf8g1jh9UMghviCzEmJDNp3zA"),
                lamports: 100000,
            })
        );

        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, 'processed');
        
    }, [publicKey, sendTransaction, connection]);

    return (
        <button onClick={onClick} disabled={!publicKey}>
            Send 1 lamport to a random address!
        </button>
    );
};
