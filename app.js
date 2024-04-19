const express = require('express');
const RippleKeypairs = require('ripple-keypairs');
const { RippleAPI } = require('ripple-lib');
const { Wallet } = require('xrpl');
const session = require('express-session');

const app = express();
app.use(express.json()); // Middleware to parse JSON request body

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

// Initialize RippleAPI with testnet server
const api = new RippleAPI({
    server: 'wss://s.altnet.rippletest.net:51233' // Testnet server
});

// Connect to the XRPL when the server starts
api.connect().then(() => {
    console.log('Connected to XRPL testnet');
}).catch(error => {
    console.error('Error connecting to XRPL:', error);
});

// Login route
app.post('/login', async (req, res) => {
    const { walletAddress, walletSecret } = req.body;

    // Validate wallet walletAddress and walletSecret
    if (!walletAddress || !walletSecret) {
        return res.status(400).json({ error: 'Wallet walletAddress and walletSecret are required.' });
    }

    // Validate the wallet address
    if (!isValidRippleAddress(walletAddress)) {
        return res.status(400).send('Invalid Ripple wallet address');
    }

    // Check authentication
    const authenticationResult = await validateWalletSecret(walletAddress, walletSecret);
    if (authenticationResult === true) {
        // Store wallet address and secret in session
        req.session.user = {
            walletAddress: walletAddress,
            walletSecret: walletSecret
        };
        console.log(req.session.user);
        return res.json({ success: true, message: 'Login successful!' });
    } else {
        return res.status(401).json({ error: authenticationResult });
    }
});


// Define a route to get account information
app.post('/account-info', (req, res) => {

    if(!req.session.user){
        return res.status(400).json({ error: 'User not logged in!' });
    }

    const { walletSecret } = req.session.user;

    if (!walletSecret) {
        return res.status(400).json({ error: 'Wallet Secret is required' });
    }

    // Derive public key and address from the secret key
    const keypair = RippleKeypairs.deriveKeypair(walletSecret);
    const publicKey = RippleKeypairs.deriveAddress(keypair.publicKey);

    // Get account info using the derived address
    api.getAccountInfo(publicKey).then(accountInfo => {
        const response = {
            publicKey,
            walletSecret,
            keypair,
            accountInfo
        };
        res.json(response);
    }).catch(error => {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to retrieve account information' }); // Send error response
    });
});


app.post('/previous-transactions', async (req, res) => {

    if(!req.session.user){
        return res.status(400).json({ error: 'User not logged in!' });
    }

    const { walletSecret } = req.session.user;

    if (!walletSecret) {
        return res.status(400).json({ error: 'Wallet Secret is required' });
    }

    try {
        // Derive public key and address from the secret key
        const keypair = RippleKeypairs.deriveKeypair(walletSecret);
        const publicKey = RippleKeypairs.deriveAddress(keypair.publicKey);
        console.log(publicKey)

        // Get previous transactions using the derived address
        const transactions = await api.getTransactions(publicKey, { limit: 10 }); // Limiting to 10 transactions for example

        const response = {
            publicKey,
            transactions
        };

        res.json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to retrieve previous transactions' }); // Send error response
    }
});

// Function to validate if the provided wallet secret corresponds to the given wallet address
async function validateWalletSecret(walletAddress, walletSecret) {
    try {
        const wallet = Wallet.fromSeed(walletSecret);
        const secretAddress = wallet.address;

        if (secretAddress === walletAddress) {
            return true; 
        } else {
            return 'Invalid wallet secret.';
        }
    } catch (error) {
        console.error(error);
        return 'Error validating wallet secret.';
    }
}

// Function to validate XRP wallet address
function isValidRippleAddress(address) {
    const rippleAddressRegex = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/;
    return rippleAddressRegex.test(address);
}

// Start the server
const PORT = 3000;
const localhostURL = `http://localhost:${PORT}`;
app.listen(PORT, () => {
    console.log(`Server is running at ${localhostURL}`);
});

// Gracefully handle shutdown
process.on('SIGINT', async () => {
    try {
        await api.disconnect();
        console.log('Disconnected from XRPL');
        process.exit(0);
    } catch (error) {
        console.error('Error disconnecting from XRPL:', error);
        process.exit(1);
    }
});
