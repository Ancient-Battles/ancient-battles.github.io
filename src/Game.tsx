import * as React from 'react';
import { default as Tableau, TableauProps } from './components/tableau/Tableau';
import {
  default as Card, CardProps,
  CardDragProps
} from './components/card/Card';
import { default as Pile, PileProps } from './components/pile/Pile';
import {
  GameState, Move, PileState,
  TableauState, MoveProps, Shuffle, CardGameEngine, AttackProps, Attack
} from './lib/CardGameEngine';
import { default as MultiBackend, Preview } from 'react-dnd-multi-backend';
import HTML5toTouch from 'react-dnd-multi-backend/lib/HTML5toTouch';
import { DragDropContext } from 'react-dnd';
import './assets/game.css';
import ItemTypes from './lib/ItemTypes';
import { Phase } from './lib/CardGameEngine';

const gameState = require('./assets/state.json');
gameState.allowInvalidMoves = false;

interface StringHash<T> {
  [key: string]: T;
}

export interface GameProps {
  piles: PileProps[];
  tableaux: TableauProps[];
  cards: CardProps[];
  initialMoves: MoveProps[];
}

class Game extends React.Component<GameProps, GameState> {
  constructor(props: GameProps) {
    super(props);
    this.state = JSON.parse(JSON.stringify(gameState));
  }

  restart() {
    this.setState(prevState => JSON.parse(JSON.stringify(gameState)));
    this.props.cards.forEach((value, index, array) => {value.healthValue = value.originalHealthValue; });
  }

  initialMoves() {
    if (this.props.initialMoves) {
      this.props.initialMoves.forEach(move => {
        let moveSubject = move.amount && move.amount > 0 ? move.amount : (move.card ? move.card : 0);
        let m = new Move(
          move.from,
          move.to,
          moveSubject,
          false // automatic move, no rule checking
        );
        if (m.isValid(this.state)) {
          // multiple state changes are pushed in here
          this.setState(prevState => m.make(prevState));
        }
      });
    }
  }

  initialShuffle() {
    if (this.props.piles) {
      this.props.piles.forEach(pileProps => {
        if (pileProps.initialShuffle) {
          let shuffle = new Shuffle(pileProps.id);
          if (shuffle.isValid(this.state)) {
            // multiple state changes are pushed in here
            console.log('setState');
            this.setState(prevState => shuffle.animate(prevState));
            window.setTimeout(
              () => {
                this.setState(prevState => shuffle.make(prevState));
              },
              1000
            );
          }
        }
      });
    }
  }

  changePhase() {
    this.setState(prevState => {
      let newState = JSON.parse(JSON.stringify(prevState));
      switch (prevState.phase) {
        case Phase.DrawPhase:
          newState.phase = Phase.MainPhase;
          break;
        case Phase.MainPhase:
          newState.phase = Phase.BattlePhase;
          break;
        case Phase.BattlePhase:
          newState.phase = Phase.EndPhase;
          break;
        case Phase.EndPhase:
          newState.player1Turn = !newState.player1Turn;
          resetPilesActions(newState.piles);
          this.addMana();
          newState.hasDrawn = false;
          newState.phase = Phase.DrawPhase;
          break;
        default:
          console.error('Game Phase not valid');
      }
      return newState;
    });
  }

  changeTurn() {
    this.setState(prevState => {
      let newState = JSON.parse(JSON.stringify(prevState));
      newState.player1Turn = !newState.player1Turn;
      newState.hasDrawn = false;
      newState.phase = Phase.DrawPhase;
      resetPilesActions(newState.piles);
      this.addMana();
      return newState;
    });
  }

  addMana() {
    this.setState(prevState => {
      let newState = JSON.parse(JSON.stringify(prevState));
      newState.turnMana += 1;
      for (let i = 0; i < newState.playerMana.length; i++) {
        newState.playerMana[i] = Math.min(Math.max(newState.turnMana, 0), 10);
      }
      return newState;
    });
  }

  toggleInvalidMoves() {
    this.setState(prevState => {
      let newState = JSON.parse(JSON.stringify(prevState));
      newState.allowInvalidMoves = !prevState.allowInvalidMoves;
      return newState;
    });
  }

  render() {
    let player1Warlord = this.props.cards.find(x => x.id === this.state.piles.player1Warlord.cards[0]);
    let player1WarlordHP = 0;
    let player2Warlord = this.props.cards.find(x => x.id === this.state.piles.player2Warlord.cards[0]);
    let player2WarlordHP = 0;
    if (player1Warlord !== undefined) {
      player1WarlordHP = player1Warlord.healthValue;
    }
    if (player2Warlord !== undefined) {
      player2WarlordHP = player2Warlord.healthValue;
    }
    let winner = this.state.ended ? this.state.winner : '';
    let tableaux: JSX.Element[] = [];
    this.props.tableaux.forEach(tableauProps => {
      let piles = this.renderPiles(tableauProps.id);
      tableaux.push(
        <Tableau key={tableauProps.id} {...tableauProps}>
          {piles}
        </Tableau>
      );
    });
    return (
      <div>
        <nav>
          <ul>
            <li><button onClick={() => this.initialShuffle()}>Shuffle Decks</button></li>
            <li><button onClick={() => this.initialMoves()}>Initial Deal</button></li>
            <li><button onClick={() => this.changePhase()}>Change Phase</button></li>
            <li><button onClick={() => this.changeTurn()}>Change Turn</button></li>
            <li><button onClick={() => this.restart()} className="restart">Restart</button></li>
            <li><div className="textBox"><input
              name="allowInvalidMoves"
              type="checkbox"
              checked={this.state.allowInvalidMoves}
              onChange={() => this.toggleInvalidMoves()}
            />allow invalid moves</div></li>
            <li>
              <div className="scoreBox">
                <pre>
                  {'Phase: ' + this.state.phase.toString() + '\n' +
                  'Turn: ' + CardGameEngine.getTurnPlayer(this.state) + '\n' +
                  'Player 1: ' + player1WarlordHP + ' HP' + '\n' + 
                  'Player 2: ' + player2WarlordHP + ' HP' + '\n' +
                  'Player 1 Mana: ' + this.state.playerMana[0] + '\n' +
                  'Player 2 Mana: ' + this.state.playerMana[1] + '\n' +
                  'Winner: ' + winner + ''}
                </pre>
              </div>
            </li>
          </ul>
        </nav>
          
        {tableaux}
        <Preview generator={generatePreview} />
      </div>
    );
  }

  renderPiles(tableauKey: string) {
    let piles: JSX.Element[] = [];
    if (this.state.tableaux.hasOwnProperty(tableauKey)) {
      let tabState: TableauState = this.state.tableaux[tableauKey];

      tabState.piles.forEach(pileKey => {
        const pileProps = this.props.piles.find(cPileProps => cPileProps.id === pileKey);
        if (pileProps) {
          pileProps.makeMove = this.makeMove.bind(this);
          pileProps.makeAttack = this.makeAttack.bind(this);
          let pileState = CardGameEngine.getPileState(this.state, pileProps.id);
          let cards = this.renderCards(pileKey);
          piles.push(
            <Pile
              key={pileProps.id}
              allowInvalidMoves={this.state.allowInvalidMoves}
              getGameState={() => this.state}
              getGameProps={() => this.props}
              lastIncomingMoveValidity={pileState.lastIncomingMoveValidity}
              lastIncomingAttackValidity={pileState.lastIncomingAttackValidity}
              hasActed={pileState.hasActed}
              {...pileProps}
            >
              {cards}
            </Pile>
          );
        }
      });
    }
    return piles;
  }

  makeMove(moveProps: MoveProps): void {
    let moveSubject = moveProps.amount && moveProps.amount > 0 ?
      moveProps.amount :
      (moveProps.card ? moveProps.card : 0);
    let m = new Move(
      moveProps.from,
      moveProps.to,
      moveSubject,
      true,
      moveProps.incomingRules,
      this.props
    );

    this.setState(prevState => {
      let isValid: boolean = m.isValid(prevState);
      let newState = m.make(prevState);
      let ps = CardGameEngine.getPileState(newState, moveProps.to);
      ps.lastIncomingMoveValidity = isValid;
      return newState;
    });

    // clean lastIncomingMove after 1 sec
    window.setTimeout(
      () => {
        this.setState(prevState => {
          let newState: GameState = JSON.parse(JSON.stringify(prevState));
          Object.keys(newState.piles).forEach(pileId => newState.piles[pileId].lastIncomingMoveValidity = true);
          return newState;
        });
      },
      1000
    );
  }

  makeAttack(attackProps: AttackProps): void {
    let a = new Attack(
      attackProps.from,
      attackProps.to,
      attackProps.attackingCard,
      attackProps.defendingCard,
      true,
      this.props,
      attackProps.incomingRules,
    );

    this.setState(prevState => {
      let isValid: boolean = a.isValid(prevState);
      let newState = a.make(prevState);
      let ps = CardGameEngine.getPileState(newState, attackProps.to);
      ps.lastIncomingAttackValidity = isValid;
      return newState;
    });

    // clean lastIncomingMove after 1 sec
    window.setTimeout(
      () => {
        this.setState(prevState => {
          let newState: GameState = JSON.parse(JSON.stringify(prevState));
          Object.keys(newState.piles).forEach(pileId => newState.piles[pileId].lastIncomingMoveValidity = true);
          return newState;
        });
      },
      1000
    );
  }

  renderCards(pileKey: string) {
    let cards: JSX.Element[] = [];
    if (this.state.piles.hasOwnProperty(pileKey)) {
      let pileState: PileState = this.state.piles[pileKey];

      pileState.cards.forEach(cardKey => {
        const cardProps = this.props.cards.find(cCardProps => cCardProps.id === cardKey);
        if (cardProps) {
          cardProps.parentPile = pileKey;
          if (pileState.isShuffling) {
            cardProps.animationName = 'shuffle';
          } else {
            cardProps.animationName = 'none';
          }
          cards.push(
            <Card key={cardProps.id} {...cardProps} />
          );
        }
      });
    }
    return cards;
  }
}

function resetPilesActions(piles: StringHash<PileProps>) {
  piles.player1Minion0.hasActed = false;
  piles.player1Minion1.hasActed = false;
  piles.player1Minion2.hasActed = false;
  piles.player1Minion3.hasActed = false;
  piles.player1Warlord.hasActed = false;
  piles.player2Minion0.hasActed = false;
  piles.player2Minion1.hasActed = false;
  piles.player2Minion2.hasActed = false;
  piles.player2Minion3.hasActed = false;
  piles.player2Warlord.hasActed = false;
}

/* helper functions */

function generatePreview(type: ItemTypes, item: {}, style: React.CSSProperties) {
  if (type === ItemTypes.CARD) {
    const cardProps: CardDragProps = item as CardDragProps;

    const url = cardProps ? cardProps.previewUrl : '';

    return (
      <div
        className={'card is-flying ' + cardProps.cardId}
        style={style}
      >
        <img src={url} />
      </div>
    );
  }

  return <div />;
}

export default DragDropContext(MultiBackend(HTML5toTouch))(Game);
