// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IMain } from "./interfaces/IMain.sol";
import { ISilentERC20 } from "./token/ISilentERC20.sol";
import { IVerifier } from "./interfaces/IVerifier.sol";

import { Extractor } from "./lib/Extractor.sol";
import { PoseidonT3 } from "@fifteenfigures/lib/PoseidonHash.sol";

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { NATIVE_TOKEN, Fee } from "./Fee.sol";
import { Recorder } from "./Recorder.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TinyMerkleTree } from "@fifteenfigures/TinyMerkleTree.sol";

contract Main is IMain, Recorder, Fee, TinyMerkleTree, ReentrancyGuard, ERC20 {
    using Extractor for bytes;

    uint8 internal constant QUOTIENT = 100;
    uint32 internal constant NOTE = 100e6;
    ISilentERC20 internal immutable SILENT_TOKEN;
    IVerifier internal verifier;

    constructor (
        bytes32 initLeaf,
        address _verifier,
        address silentToken,
        string memory name,
        string memory symbol
    ) TinyMerkleTree (initLeaf) ERC20(name, symbol) {
        SILENT_TOKEN = ISilentERC20(silentToken);
        verifier = IVerifier(_verifier);
        emit DepositAdded(initLeaf);
    }

    receive() external payable {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function deposit(DepositParams calldata depositParams) public {
        bytes calldata depositKey = depositParams.depositKey;
        (bytes32 keyHash, uint256 amount) = depositKey._extractKeyMetadata();

        if (depositParams.includeLeaf) {
            bytes32 leaf = bytes32(PoseidonT3.hash([uint256(keyHash), amount]));
            
            if (_leafExists(leaf)) revert KeyAlreadyUsed(leaf);

            SILENT_TOKEN.transferFrom(msg.sender, address(this), amount);

            _takeFee(SILENT_TOKEN, amount);
            _addLeaf(leaf);
            _recordDeposit(leaf);

            emit DepositAdded(leaf);
        } else {
            SILENT_TOKEN.transferFrom(msg.sender, address(this), amount);
            _mint(depositParams.recipient, amount);
        }
    }

    // This function is experimental. I expect it to cost a shit ton of gas.
    function splitDeposit(DepositParams calldata depositParams) public {
        bytes calldata depositKey = depositParams.depositKey;
        (bytes32 keyHash, uint256 amount) = depositKey._extractKeyMetadata();

        SILENT_TOKEN.transferFrom(msg.sender, address(this), amount);
        
        uint256 quotient = amount / NOTE;
        uint256 remainder = amount % NOTE;

        if (quotient > QUOTIENT) revert Max100By100();

        uint8 i;
        DepositParams memory params;

        for (uint8 j; j < quotient; j++) {
            params = _buildParams(keyHash, i, depositParams.recipient);
            this.deposit(params);
            i++;
        }

        if (remainder > 0) {
            params = _buildParams(keyHash, i, depositParams.recipient);
            this.deposit(params);
        }
    }
    
    function withdraw(
        bytes32 root,
        bytes calldata withdrawalKey,
        uint256[2] calldata pA,     // Proof.
        uint256[2][2] calldata pB,  // Proof.
        uint256[2] calldata pC,     // Proof.
        uint256 nullifier,
        address recipient,
        uint256 amount
    ) public nonReentrant {
        if (!_rootIsInHistory(root)) revert RootNotInHistory(root);

        if (nullifierUsed[nullifier]) revert NullifierUsed(nullifier);
        nullifierUsed[nullifier] = true;

        (bytes32 keyHash, uint256 amountInKey) = withdrawalKey._extractKeyMetadata();

        uint256 maxWithdrawable = _getMaxWithdrawalOnAmount(amountInKey);
        uint256 amountWithdrawn = withdrawals[withdrawalKey];

        if ((amountWithdrawn + amount) > maxWithdrawable) revert WithdrawalExceedsMax(amount);
        withdrawals[withdrawalKey] += amount;

        uint256[4] memory publicSignals;
        publicSignals[0] = uint256(root);
        publicSignals[1] = uint256(keyHash);
        publicSignals[2] = uint256(amountInKey);
        publicSignals[3] = nullifier;

        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) revert ProofNotVerified();

        SILENT_TOKEN.transfer(recipient, amount);
    }

    function unWrap(uint256 amount, address recipient) public {
        _burn(msg.sender, amount);
        SILENT_TOKEN.transfer(recipient, amount);
    }

    function _getMaxWithdrawalOnAmount(uint256 amount) internal pure returns (uint256 maxWithdrawal) {
        uint256 fee = _calculateFee(amount);
        maxWithdrawal = amount - fee;
    }
    
    function _buildParams(
        bytes32 keyHash,
        uint8 i,
        address recipient
    ) internal pure returns (DepositParams memory params) {
        bytes memory key = abi.encodePacked(
            bytes32(uint256(keyHash) + i),
            bytes32(uint256(NOTE))
        );

        params = DepositParams({
            depositKey: key,
            includeLeaf: true,
            recipient: recipient
        });
    }

    function _rootIsInHistory(bytes32 root) private view returns (bool) {
        for (uint8 i = 0; i < STORED_ROOT_LENGTH; i++) {
            if (last64Roots[i] == root) return true;
        }

        return false;
    }
}