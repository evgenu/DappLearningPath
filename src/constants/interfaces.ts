export interface IAppState {
  fetching: boolean;
  address: string;
  library: any;
  connected: boolean;
  chainId: number;
  pendingRequest: boolean;
  result: any | null;
  electionContract: any | null;
  info: any | null;
  currentLeader: number;
  transactionHash: number;
  transactionStatus: string;
  electionEnded: boolean;
  winner: string;
}

export interface IVoteData {
  state: string;
  votesBiden: number;
  votesTrump: number;
  seats: number;
}