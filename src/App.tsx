import * as React from 'react';
import * as https from 'https';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import ConnectButton from './components/ConnectButton';
import Column from './components/Column';
import Header from './components/Header';
import Loader from './components/Loader';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';
import { US_ELECTION_ADDRESS, ETHERSCAN_API_KEY, IAppState, IVoteData } from './constants';
import { SLayout, SContent, SContainer, SLanding } from './style'
import { getContract } from './helpers/ethers';

import US_ELECTION from './constants/abis/USElection.json';

const INITIAL_VOTE: IVoteData = {
  state: '',
  votesBiden: 0,
  votesTrump: 0,
  seats: 0
}

const INITIAL_STATE: IAppState = {
  fetching: false,
  address: '',
  library: null,
  connected: false,
  chainId: 3,
  pendingRequest: false,
  result: null,
  electionContract: null,
  info: null,
  currentLeader: 0,
  transactionHash: 0,
  transactionStatus: '',
  electionEnded: false,
  winner: ''
};

class App extends React.Component<any, any> {
  // @ts-ignore
  public web3Modal: Web3Modal;
  public state: IAppState;
  public provider: any;
  public vote: IVoteData;

  constructor(props: any) {
    super(props);
    this.state = {
      ...INITIAL_STATE
    };
    this.vote = {
      ...INITIAL_VOTE
    };

    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions()
    });
  }

  public componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect();
    }
  }

  public onConnect = async () => {
    this.provider = await this.web3Modal.connect();

    const library = new Web3Provider(this.provider);

    const network = await library.getNetwork();

    const address = this.provider.selectedAddress ? this.provider.selectedAddress : this.provider.accounts[0];

    await this.setState({
      library,
      chainId: network.chainId,
      address,
      connected: true
    });

    await this.subscribeToProviderEvents(this.provider);

    const electionContract = getContract(US_ELECTION_ADDRESS, US_ELECTION.abi, library, address);

    await this.setState({
      library,
      chainId: network.chainId,
      address,
      connected: true,
      electionContract
    });

    await this.currentLeader()

  };

  public currentLeader = async () => {
    const { electionContract } = this.state;

    const currentLeader = await electionContract.currentLeader();

    

    await this.setState({ currentLeader });
  };

  public submitElectionResult = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { electionContract } = this.state;

    const dataArr = [
      this.vote.state,
      this.vote.votesBiden,
      this.vote.votesTrump,
      this.vote.seats
    ];

    let transactionInformation = ' ';

    await this.setState({ fetching: true });
    const transaction = await electionContract.submitStateResult(dataArr);
    https.get(`https://api.etherscan.io/api?module=transaction&action=getstatus&txhash=0x15f8e5ea1079d9a0bb04a4c58ae5fe7654b5b2b4463375ff7ffb490aa0032f3a&apikey=${ETHERSCAN_API_KEY}`, (res) => {
      let requestData = '';

      res.on('data', (chunk) => {
        requestData += chunk;
      });

      res.on('end', () => {
        transactionInformation = requestData;
      });

    });

    await this.setState({ transactionStatus: JSON.stringify(transactionInformation) });

    await this.setState({ transactionHash: transaction.hash });

    const transactionReceipts = await transaction.wait();
    if (transactionReceipts.status !== 1) {
      alert("Cannot submit election result.");
    }

    await this.currentLeader()
  }

  public endElection = async () => {
    const { electionContract } = this.state;
    await electionContract.endElection().catch((e: any) => {
      alert("Cannot end election.");
    });

    this.provider.on("LogElectionEnded", (electionWinner: string) => {
      this.setState({ winner: electionWinner });
    });
  }

  public subscribeToProviderEvents = async (provider:any) => {
    if (!provider.on) {
      return;
    }

    provider.on("accountsChanged", this.changedAccount);
    provider.on("networkChanged", this.networkChanged);
    provider.on("close", this.close);

    await this.web3Modal.off('accountsChanged');
  };

  public async unSubscribe(provider:any) {
    // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
    window.location.reload(false);
    if (!provider.off) {
      return;
    }

    provider.off("accountsChanged", this.changedAccount);
    provider.off("networkChanged", this.networkChanged);
    provider.off("close", this.close);
  }

  public changedAccount = async (accounts: string[]) => {
    if(!accounts.length) {
      // Metamask Lock fire an empty accounts array 
      await this.resetApp();
    } else {
      await this.setState({ address: accounts[0] });
    }
  }

  public networkChanged = async (networkId: number) => {
    const library = new Web3Provider(this.provider);
    const network = await library.getNetwork();
    const chainId = network.chainId;
    await this.setState({ chainId, library });
  }
  
  public close = async () => {
    this.resetApp();
  }

  public getNetwork = () => getChainData(this.state.chainId).network;

  public getProviderOptions = () => {
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: process.env.REACT_APP_INFURA_ID
        }
      }
    };
    return providerOptions;
  };

  public resetApp = async () => {
    await this.web3Modal.clearCachedProvider();
    localStorage.removeItem("WEB3_CONNECT_CACHED_PROVIDER");
    localStorage.removeItem("walletconnect");
    await this.unSubscribe(this.provider);

    this.setState({ ...INITIAL_STATE });

  };

  public render = () => {
    const {
      address,
      connected,
      chainId,
      fetching
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.resetApp}
          />

          {this.state.connected && this.state.winner === '' && <form onSubmit={this.submitElectionResult}>
            <label>State: <input type="text" name="State" onChange={event => {this.vote.state = event.target.value}}/></label>
            <label>Biden: <input type="text" name="VotesBiden" onChange={event => {this.vote.votesBiden = Number(event.target.value)}}/></label>
            <label>Trump: <input type="text" name="VotesTrump" onChange={event => {this.vote.votesTrump = Number(event.target.value)}}/></label>
            <label>Seats: <input type="text" name="Seats" onChange={event => {this.vote.seats = Number(event.target.value)}}/></label>
            <input type="submit" value="Submit"/>
          </form>}
          {this.state.connected && this.state.winner === '' && <ConnectButton onClick={this.currentLeader} value="Refresh Leaderboard" />}
          {this.state.connected && this.state.winner === '' && <h1>
          {this.state.winner === '' && this.state.currentLeader !== 0 ? (("Current leader is").concat(" ", (this.state.currentLeader - 1) ? "TRUMP" : "BIDEN")) : 'It is a tie' }
          </h1>}
          {this.state.connected && this.state.winner === '' && <h3>{this.state.transactionHash ? this.state.transactionHash : "No current transtaction"}</h3>}
          {this.state.connected && this.state.winner === '' && <h3>{this.state.transactionHash ? this.state.transactionStatus : "no status"}</h3>}
          {this.state.connected && this.state.winner === '' && <ConnectButton onClick={this.endElection} value="End Election" />}
          {this.state.connected && this.state.winner !== '' && <h3>{("Current leader is").concat(" ", (this.state.currentLeader - 1) ? "TRUMP" : "BIDEN")}</h3>}
          <SContent>
            {fetching ? (
              <Column center>
                <SContainer>
                  <Loader />
                </SContainer>
              </Column>
            ) : (
                <SLanding center>
                  {!this.state.connected && <ConnectButton onClick={this.onConnect} value='Login' />}
                </SLanding>
              )}
          </SContent>
        </Column>
      </SLayout>
    );
  };
}

export default App;
