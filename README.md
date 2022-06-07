# IDO and INO Launchpad
Launpad smart contracts support **IDO (Initial Dex Offering for ERC20)** and **INO (Initial NFT Offering for ERC721 and ERC1155)**.
## Features
- Support contract upgradeable
- Solidity 0.8.x
- Governance
- Lazy-minting for ERC721 and ERC1155
- Contract factory for INO
## Set up
Node >= 10.x && yarn > 1.x
```
$ node --version
v16.13.0

$ npm install --global yarn

$ yarn --version
1.22.17
```

Install dependencies
```
$ yarn
```
## Test
1. Compile contract
```
$ yarn compile
```
2. Run tests
```
$ yarn test
```
## Testnet deployment
1. BSC Testnet
```
PRIVATE_KEY=<admin-private-key> yarn deploy:bsctest
```

2. Create campaign for NFT721
```
PRIVATE_KEY=<manager-private-key> \
FACTORY721_ADDRESS=<factory-721-address> \
CAMPAIGN_ID=1 \
START_AT=1641543770 \
END_AT=1644135770 \
PAYMENT_TOKEN_ADDR=<erc20-address || address-zero>\
TOKEN_NAME=TESTTOKEN \
TOKEN_SYMBOL=TTK \
TOKEN_BASE_URI=<token-uri> \
  npx hardhat run --network testnet scripts/createCampaign721.ts
```

3. Create campaign for NFT1155
```
PRIVATE_KEY=<manager-private-key> \
FACTORY721_ADDRESS=<factory-1155-address> \
CAMPAIGN_ID=2 \
START_AT=1641543770 \
END_AT=1644135770 \
PAYMENT_TOKEN_ADDR=<erc20-address || address-zero>\
TOKEN_BASE_URI=<token-uri> \
  npx hardhat run --network testnet scripts/createCampaign1155.ts
```
## Upgrade factory contracts
1. Clean cache and precompiled folders to avoid conflict errors
```
$ rm -rf artifacts cache .oppenzeppelin
```
2. Put your folder `.oppenzeppelin` into root directory
3. Update your smart contracts
4. Run upgrade via `ProxyAdmin` contract

```
$ yarn upgrade:bsctest
```
OR

```
$ yarn upgrade:bscmain
```

For more information, you can check this link [here](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)
## Solidity linter and prettiers
1. Run linter to analyze convention and security for smart contracts
```
$ yarn sol:linter
```
2. Format smart contracts
```
$ yarn sol:prettier
```
3. Format typescript scripts for unit tests, deployment and upgrade
```
$ yarn ts:prettier
```

* Note: Updated husky hook for pre-commit