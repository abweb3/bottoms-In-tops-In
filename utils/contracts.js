import { ethers } from 'ethers';
import BottomsInTopsInABI from '../artifacts/contracts/BottomsInTopsIn.sol/BottomsInTopsIn.json';

const BOTTOMS_IN_TOPS_IN_ADDRESS = 'YOUR_CONTRACT_ADDRESS_HERE';

export function getBottomsInTopsInContract(providerOrSigner) {
  return new ethers.Contract(BOTTOMS_IN_TOPS_IN_ADDRESS, BottomsInTopsInABI.abi, providerOrSigner);
}
