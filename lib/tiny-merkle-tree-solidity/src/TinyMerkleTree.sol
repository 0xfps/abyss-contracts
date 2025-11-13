// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { PoseidonT2, PoseidonT3 } from "./lib/PoseidonHash.sol";

/**
 * @title   TinyMerkleTree.
 * @author  fifteenfigures (@fifteenfigures).
 * @dev     A small, simple MerkleTree peripheral contract.
 */
abstract contract TinyMerkleTree {
    uint40 internal immutable MAX_LEAVES_LENGTH = 2 ** 32;
    uint8 internal constant STORED_ROOT_LENGTH = 64;

    /**
     * @notice  This number is used to determine which element to update in the
     *          last64Roots. If the rootIndex equals the `STORED_ROOT_LENGTH`,
     *          the rootIndex is reset to 0. This ensures that the contents of
     *          the last64Roots array are always the last 64 roots.
     */
    uint8 internal rootIndex;
    bytes32[STORED_ROOT_LENGTH] internal last64Roots;

    /// @dev number of leaves on depth 0 (base).
    uint40 public length;
    bytes32 public root;

    /// @notice Number of hashes (leaves) stored on each depth.
    ///         Depth 0 is the base of the tree.
    mapping(uint8 depth => uint40 depthLength) internal depthLengths;
    /// @notice Last stored hash for each depth.
    mapping(uint8 depth => bytes32 depthHash) internal depthHashes;

    /**
     * @notice  Set a leaf at the start to kick off the tree building.
     */
    constructor(bytes32 initLeaf) {
        bytes32 leaf = initLeaf;
        root = bytes32(PoseidonT2.hash([uint256(leaf)]));

        length = 1;
        depthLengths[0] = 1;
        depthHashes[0] = leaf;
    }

    function getLast64Roots() public view returns (bytes32[STORED_ROOT_LENGTH] memory) {
        return last64Roots;
    }

    /**
     * @notice  Adds a leaf to the tree, and simultaneously computes a new
     *          root from the ground up, using Poseidon hash. Leaf can be
     *          any bytes32. It SHOULD be the Poseidon equivalent of the
     *          keccak256 hash of the deposit key. Each leaf is added at 
     *          the last slot of each depth and recomputed upwards, if the
     *          depth below the upper depth is twice the length of the upper
     *          depth, the current leaf is stored at that depth. It is always
     *          recalculated from 0 to highest depth.
     *          
     *          Previous hashes aren't taken into consideration unless it is a
     *          sibling of the current hash. In that case, it's updated and
     *          used for the next computation.
     *
     *          I expect there to be only 32 iterations from depth 0 to last 
     *          root on a full tree. Length is halved until it gets to 2.
     */
    function _addLeaf(bytes32 leaf) internal returns (bytes32 _root) {
        // Do not exceed 4,294,967,296 leaves.
        if (length++ == MAX_LEAVES_LENGTH + 1) revert("Tree Full!");

        depthLengths[0] = length;

        uint40 newLength = length;
        uint8 depth = 0;
        bytes32 currentHash = leaf;

        while(newLength >= 2) {
            currentHash = _getHashForDepth(newLength, depth, currentHash);
            newLength = (newLength + 1) / 2;
            depth++;
        }

        _root = currentHash;
        _storeRoot(_root);
        root = _root;
    }

    function _getHashForDepth(uint40 len, uint8 depth, bytes32 leaf) private returns (bytes32 hash) {
        bytes32 hashLeft;
        bytes32 hashRight;

        // Last two leaves leading to root.
        if (len == 2) {
            (hashLeft, hashRight) = _sortHashes(depthHashes[depth], leaf);
            hash = bytes32(PoseidonT3.hash([uint256(hashLeft), uint256(hashRight)]));
            
            depthHashes[depth + 1] = hash; // New Root.
            // If a new root is computed, only increment the next depth if it's still 0.
            // Subsequent root computations to be stored at that depth doesn't need a
            // new increment.
            if (depthLengths[depth + 1] == 0) depthLengths[depth + 1]++;
        } else {
            if (len % 2 == 1)
                // Return right most leaf if it has no stored sibling, i.e depth is odd.
                // Leaves are not stored if their current depth is odd except for the base
                // depth (0).
                // Recursively, leaves are not also stored if their addition to the current
                // depth isn't half the length of the previous depth.
                // This is because, only stored leaves will be a result of the last two
                // siblings of the depth before it.
                hash = leaf;
            else {
                (hashLeft, hashRight) = _sortHashes(depthHashes[depth], leaf);
                hash = bytes32(PoseidonT3.hash([uint256(hashLeft), uint256(hashRight)]));
            }
        }

        if (depth == 0)
            depthHashes[depth] = leaf;
        else {
            uint40 curDepthLength = depthLengths[depth];
            uint40 prevDepthLength = depthLengths[depth - 1];

            // When leaf is added.
            // Prev depth handles itself via the iteration.
            if (((curDepthLength + 1) * 2 == prevDepthLength)) {
                depthLengths[depth]++;
                // Append latest leaf if this is last stage to root because leaf yielded root.
                // If not, append the last hash.
                // Note must be taken that, for lengths % 2 != 0, the hash is == the leaf (L71, L107).
                depthHashes[depth] = len == 2 ? leaf : hash;
            }
        }
    }

    function _sortHashes(bytes32 hashLeft, bytes32 hashRight) private pure returns (bytes32, bytes32) {
        return hashLeft < hashRight ? (hashLeft, hashRight) : (hashRight, hashLeft);
    }

    function _storeRoot(bytes32 _root) private {
        if (rootIndex == STORED_ROOT_LENGTH) rootIndex = 0;
        last64Roots[rootIndex] = _root;
        rootIndex++;
    }
}