// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IFactory {
    struct WaveInfo {
        uint256 limit;
        uint256 startAt;
        uint256 endAt;
    }

    struct Setting {
        uint256 startAt;
        uint256 endAt;
        address paymentToken;
        string name;
        string symbol;
        string uri;
    }

    event NewCampaign(
        uint256 indexed campaignId,
        address indexed ino,
        uint256 start,
        uint256 end
    );

    event NewWave(
        uint256 indexed campaignId,
        address indexed ino,
        uint256 indexed waveId,
        uint256 start,
        uint256 end
    );

    function updateGovernance(address _newGovernance) external;

    function createCampaign(uint256 _campaignId, Setting memory _setting)
        external
        returns (address _nft);

    function setWave(
        uint256 _campaignId,
        uint256 _waveId,
        uint256 _limit,
        uint256 _startAt,
        uint256 _endAt
    ) external;
}
