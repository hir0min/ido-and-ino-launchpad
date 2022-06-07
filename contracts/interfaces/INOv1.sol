//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface INOv1 {
    struct Ticket {
        uint256 saleId;
        address creator;
        uint256 tokenId;
        uint256 unitPrice;
        address paymentToken;
        uint256 amount;
    }

    struct Bulk {
        uint256 saleId;
        address creator;
        uint256[] tokenIds;
        uint256 unitPrice;
        address paymentToken;
    }

    event Wave(
        uint256 indexed campaignId,
        uint256 indexed waveId,
        uint256 start,
        uint256 end
    );
    event NativePayment(
        address indexed from,
        address indexed to,
        uint256 amount
    );

    event Redeem(
        address indexed nft,
        address indexed buyer,
        uint256 indexed tokenId,
        address paymentToken,
        uint256 price,
        uint256 amount
    );

    event RedeemBulk(
        address indexed nft,
        address indexed buyer,
        uint256[] tokenIds,
        address paymentToken,
        uint256 price
    );
}
