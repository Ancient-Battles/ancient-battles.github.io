import { isNumber } from 'util';
import { GameProps } from '../Game';
import { PileProps } from '../components/pile/Pile';
import { CardProps } from '../components/card/Card';

const CGE_DEBUG: boolean = true;

export interface MoveProps {
  from: string;
  to: string;
  amount?: number;
  card?: string;
  incomingRules?: string[];
}

export interface AttackProps {
  from: string;
  to: string;
  attackingCard: string;
  defendingCard: string;
  incomingRules?: string[];
}

export interface TableauState {
  piles: string[];
}

export interface PileState {
  cards: string[];
  showBack: boolean;
  unfolded: boolean;
  isShuffling: boolean;
  lastIncomingMoveValidity: boolean;
  lastIncomingAttackValidity: boolean;
  hasActed: boolean;
}

export interface CardState {
}

interface StringHash<T> {
  [key: string]: T;
}

export enum Phase {
  DrawPhase = 'DrawPhase',
  MainPhase = 'MainPhase',
  BattlePhase = 'BattlePhase',
  EndPhase = 'EndPhase'
}

export interface GameState {
  tableaux: StringHash<TableauState>;
  piles: StringHash<PileState>;
  allowInvalidMoves: boolean;
  player1Turn: boolean;
  phase: Phase;
  hasDrawn: boolean;
  ended: boolean;
  winner?: string;
}

export class CardGameEngine {
  static getPileState(state: GameState, pileKey: string): PileState {
    if (state.piles.hasOwnProperty(pileKey)) {
      return state.piles[pileKey];
    }
    throw new Error('Pile ' + pileKey + ' not found!');
  }

  static getPileOwner(state: GameState, pileKey: string): string {
    if (state.tableaux.hasOwnProperty('player1Tableau')) {
      let player1Tableau = 'player1Tableau';
      let player1Piles = state.tableaux[player1Tableau].piles;
      if (player1Piles.indexOf(pileKey) !== -1) {
        return 'Player 1';
      }
    }
    if (state.tableaux.hasOwnProperty('player2Tableau')) {
      let player2Tableau = 'player2Tableau';
      let player2Piles = state.tableaux[player2Tableau].piles;
      if (player2Piles.indexOf(pileKey) !== -1) {
        return 'Player 2';
      }
    }
    throw new Error('Pile ' + pileKey + ' not found!');
  }

  static isPlayer1Turn(state: GameState) {
    return state.player1Turn;
  }

  static getCurrentPhase(state: GameState) {
    return state.phase;
  }

  static getTurnPlayer(state: GameState) {
    if (state.player1Turn) {
      return 'Player 1';
    } else {
      return 'Player 2';
    }
  }
}

export interface CardGameStateChanger {
  isValid(state: GameState): boolean;
  make(state: GameState): GameState;
}

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

export class Shuffle implements CardGameStateChanger {
  private pile: string;

  constructor(pile: string) {
    this.pile = pile;
  }

  isValid(state: GameState): boolean {
    try {
      // check if pile can be found
      let myPile = CardGameEngine.getPileState(state, this.pile);

      // check if pile has cards and can be shuffled
      if (myPile.cards && myPile.cards.length > 0) {
        return true;
      } else {
        if (CGE_DEBUG) {
          console.error('Pile ' + this.pile + ' has no cards!');
        }
        return false;
      }
    } catch (e) {
      if (CGE_DEBUG) {
        console.error(e);
      }
      return false;
    }
  }

  animate(state: GameState): GameState {
    let newState = JSON.parse(JSON.stringify(state)); // clone old state

    let pileState = CardGameEngine.getPileState(newState, this.pile);

    pileState.isShuffling = true;

    return newState;
  }

  make(state: GameState): GameState {
    let newState = JSON.parse(JSON.stringify(state)); // clone old state

    let pileState = CardGameEngine.getPileState(newState, this.pile);

    pileState.isShuffling = false;
    pileState.cards = shuffle(pileState.cards);

    return newState;
  }
}

export class RuleContext {
  private state: GameState;
  private move: MoveProps;
  private attack: AttackProps;
  private props: GameProps;

  constructor(gameState: GameState, move: MoveProps, attack: AttackProps, gameProps: GameProps) {
    this.state = gameState;
    this.move = move;
    this.attack = attack;
    this.props = gameProps;
  }

  checkRule(rule: string): boolean {
    let preval = '"use strict"; ' +
      'var getCard = this.getCard.bind(this); ' +
      'var getPile = this.getPile.bind(this); ' +
      'var getStatePile = (function(p){return this.state.piles[p];}).bind(this); ' +
      'var getStatePhase = (function(p){return this.state.phase;}).bind(this);' +
      'var isPlayer1Turn = (function(p){return this.state.player1Turn;}).bind(this);' +
      'var hasDrawn = (function(p){return this.state.hasDrawn;}).bind(this);' +
      'var hasEnded = (function(p){return this.state.ended;}).bind(this);' +
      'var getLast = function(a){return a[a.length-1];}; ' +
      'var card = this.move.card; ' +
      'var fromPile = getStatePile(this.move.from); ' +
      'var toPile = getStatePile(this.move.to); ' +
      'var move = this.move; ';
      
    return eval(preval + rule);
  }

  getPile(pileId?: string): PileProps {
    let pile = this.props.piles.find(pileItem => pileItem.id === pileId);
    if (!pile) {
      throw new Error('Pile ' + pileId + ' not found!');
    }
    return pile;
  }

  getCard(cardId?: string): CardProps {
    let card = this.props.cards.find(cardItem => cardItem.id === cardId);
    if (!card) {
      throw new Error('Card ' + cardId + ' not found!');
    }
    return card;
  }
}

export class Move implements CardGameStateChanger {
  private to: string;
  private from: string;
  private card: string = '';
  private amount: number = 0;
  private manual: boolean = true;
  private incomingRules: string[];
  private gameProps?: GameProps;

  constructor(
    fromPile: string,
    toPile: string,
    card: string|number,
    manual: boolean,
    incomingRules?: string[],
    gameProps?: GameProps
  ) {
    this.from = fromPile;
    this.to = toPile;
    if (isNumber(card)) {
      this.amount = card;
    } else {
      this.amount = 1;
      this.card = card;
    }
    this.manual = manual;
    this.incomingRules = incomingRules ? incomingRules : [];
    this.gameProps = gameProps;
  }

  isValid(state: GameState): boolean {
    console.log('checking if move is valid');
    try {
      // check if piles can be found
      let fromPile = CardGameEngine.getPileState(state, this.from);
      // let toPile = CardGameEngine.getPileState(state, this.to);

      // check if this is an amount-move or a card-move
      if (this.amount <= 0 && this.card === '') {
        if (CGE_DEBUG) {
          console.error('Move has no card :(');
        }
        return false; // can not decide
      }

      // if this is an amount-move
      if (this.amount === 1 && this.card) {

        // check if source pile has the card
        if (fromPile.cards.indexOf(this.card) === -1) {
          if (CGE_DEBUG) {
            console.error('Move: FromPile ' + this.from + ' does not have a card ' + this.card);
          }
          return false;
        }

      } else {
        // check if there are enough cards
        if (fromPile.cards.length < this.amount) {
          if (CGE_DEBUG) {
            console.error('Move: FromPile ' + this.from + ' does does not have enough card to move ' + this.amount);
          }
          return false;
        }
      }

      console.log(this.manual, this.gameProps, this.incomingRules);
      if (this.manual && this.gameProps && this.incomingRules.length > 0) {
        let rc = new RuleContext(
          state,
          {
            from: this.from,
            to: this.to,
            amount: this.amount,
            card: this.card
          },
          {
            from: '',
            to: '',
            attackingCard: '',
            defendingCard: ''
          },
          this.gameProps
        );

        return this.incomingRules
          .map(rule => rc.checkRule(rule))
          .every(v => v === true);
      }

      return true;
    } catch (e) {
      if (CGE_DEBUG) {
        console.error(e);
      }
      return false;
    }
  }

  make(state: GameState): GameState {
    // clone state
    let newState = JSON.parse(JSON.stringify(state));
    if (this.manual && newState.phase === 'DrawPhase' && !(this.to === this.from)) {
      newState.hasDrawn = true;
    }
    // make card move
    if (this.amount === 1 && this.card !== '') {
      newState.piles[this.from].cards.splice(
        newState.piles[this.from].cards.indexOf(this.card),
        1
      );
      newState.piles[this.to].cards.push(this.card);
    } else {
      // make amount move
      let cards = newState.piles[this.from].cards.splice(
        newState.piles[this.from].cards.length - this.amount,
        this.amount
      );
      newState.piles[this.to].cards = [...newState.piles[this.to].cards, ...cards];
    }

    return newState;
  }
}

export class Attack implements CardGameStateChanger {
  private fromPile: string;
  private toPile: string;
  private attackingCard: string = '';
  private defendingCard: string = '';
  private manual: boolean = true;
  private gameProps: GameProps;
  private incomingRules: string[];

  constructor(
    fromPile: string,
    toPile: string,
    attackingCard: string,
    defendingCard: string,
    manual: boolean,
    gameProps: GameProps,
    incomingRules?: string[]
  ) {
    this.fromPile = fromPile;
    this.toPile = toPile;
    this.attackingCard = attackingCard;
    this.defendingCard = defendingCard;
    this.manual = manual;
    this.incomingRules = incomingRules ? incomingRules : [];
    this.gameProps = gameProps;
  }

  isValid(state: GameState): boolean {
    console.log('check if attack is valid');
    try {
      let fromPileProp = this.gameProps.piles.find(x => x.id === this.fromPile);
      if (!CardGameEngine.isPlayer1Turn(state) && CardGameEngine.getTurnPlayer(state) === 'Player 1') {
        return false;
      }
      if (CardGameEngine.isPlayer1Turn(state) && CardGameEngine.getTurnPlayer(state) === 'Player 2') {
        return false;
      }
      if (undefined !== fromPileProp && fromPileProp.hasActed) {
        return false;
      }

      // check if piles can be found
      let fromPile = CardGameEngine.getPileState(state, this.fromPile);
      let toPile = CardGameEngine.getPileState(state, this.toPile);

      // check if there is a card in the card-move
      if (this.attackingCard === '' || this.defendingCard === '') {
        if (CGE_DEBUG) {
          console.error('There is no attacker or defender');
        }
        return false;
      }
      
      if (this.attackingCard) {
        
        // check if source pile has the attackingcard
        if (fromPile.cards.indexOf(this.attackingCard) === -1) {
          if (CGE_DEBUG) {
            console.error('Attack: FromPile ' + this.fromPile + ' does not have a card ' + this.attackingCard);
          }
          return false;
        }

        // check if the target pile does have the defendingCard
        if (toPile.cards.indexOf(this.defendingCard) === -1) {
          if (CGE_DEBUG) {
            console.error('Attack: ToPile ' + this.toPile + ' does not have a card ' + this.defendingCard);
          }
          return false;
        }
      }

      console.log(this.manual, this.gameProps, this.incomingRules);
      if (this.manual && this.gameProps && this.incomingRules.length > 0) {
        let rc = new RuleContext(
          state,
          {
            from: this.fromPile,
            to: this.toPile,
          },
          {
            from: this.fromPile,
            to: this.toPile,
            attackingCard: this.attackingCard,
            defendingCard: this.defendingCard,
            incomingRules: this.incomingRules
          },
          this.gameProps
        );

        return this.incomingRules
          .map(rule => rc.checkRule(rule))
          .every(v => v === true);
      }

    } catch (e) {
      if (CGE_DEBUG) {
        console.error(e);
      }
    }
    return false;
  }
  make(state: GameState): GameState {
    // clone state
    let newState = JSON.parse(JSON.stringify(state));

    // make attack
    if (this.attackingCard !== '') {
      console.log('attacker: ' + this.attackingCard);
      console.log('defender: ' + this.defendingCard);
      let attackerOwner = CardGameEngine.getPileOwner(newState, this.fromPile);
      let attackResolution = this.resolveAttack(this.attackingCard, this.defendingCard);
      let player1Cemetery = 'player1Cemetery';
      let player2Cemetery = 'player2Cemetery';
      switch (attackResolution) {
        case -1:
          break;
        case 0:
          newState.piles[this.fromPile].cards.splice(
            newState.piles[this.fromPile].cards.indexOf(this.attackingCard),
            1
          );
          newState.piles[this.toPile].cards.splice(
            newState.piles[this.toPile].cards.indexOf(this.defendingCard),
            1
          );
          if (attackerOwner === 'Player 1') {
            newState.piles[player1Cemetery].cards.push(this.attackingCard);
            newState.piles[player2Cemetery].cards.push(this.defendingCard);
          } else {
            newState.piles[player1Cemetery].cards.push(this.defendingCard);
            newState.piles[player2Cemetery].cards.push(this.attackingCard);
          }
          if (this.fromPile === 'player1Warlord' && this.toPile === 'player2Warlord' ||
              this.fromPile === 'player2Warlord' && this.toPile === 'player1Warlord') {
                newState.winner = 'DRAW';
                newState.ended = true;
              }
          break;
        case 1:
          newState.piles[this.fromPile].cards.splice(
            newState.piles[this.fromPile].cards.indexOf(this.attackingCard),
            1
          );
          if (attackerOwner === 'Player 1') {
            newState.piles[player1Cemetery].cards.push(this.attackingCard);
            if (this.fromPile === 'player1Warlord') {
              newState.winner = 'Player 2';
              newState.ended = true;
            }
          } else {
            newState.piles[player2Cemetery].cards.push(this.attackingCard);
            if (this.fromPile === 'player2Warlord') {
              newState.winner = 'Player 1';
              newState.ended = true;
            }
          }
          break;
        case 2:
          newState.piles[this.toPile].cards.splice(
            newState.piles[this.toPile].cards.indexOf(this.defendingCard),
            1
          );
          if (attackerOwner === 'Player 1') {
            newState.piles[player2Cemetery].cards.push(this.defendingCard);
            if (this.toPile === 'player2Warlord') {
              newState.winner = 'Player 1';
              newState.ended = true;
            }
          } else {
            newState.piles[player1Cemetery].cards.push(this.defendingCard);
            if (this.toPile === 'player1Warlord') {
              newState.winner = 'Player 2';
              newState.ended = true;
            }
          }
          break;
        default:
          throw new Error('Attack Resolution not determined');
      }
      newState.piles[this.fromPile].hasActed = true;
      console.error('A true :' + this.fromPile);
    }
    return newState;
  }
  // Returns -1 if none of them died, 0 if both died, 1 if attacker died, 2 if defender died.
  // Also health and damage calculations are done
  resolveAttack(attacker: string, defender: string): number {
    let attackerCard = this.getCard(attacker);
    let defenderCard = this.getCard(defender);
    // Reduce attacker hp in defender's attackValue
    attackerCard.healthValue -= defenderCard.attackValue;
    // Reduce defender hp in attacker's attackValue
    defenderCard.healthValue -= attackerCard.attackValue;
    // Decide who dies
    if (attackerCard.healthValue > 0 && defenderCard.healthValue > 0) {
      return -1;
    } else if (attackerCard.healthValue <= 0 && defenderCard.healthValue <= 0) {
      return 0;
    } else if (attackerCard.healthValue <= 0) {
      return 1;
    } else {
      return 2;
    }
  }

  getCard(cardId?: string): CardProps {
    let card = this.gameProps.cards.find(cardItem => cardItem.id === cardId);
    if (!card) {
      throw new Error('Card ' + cardId + ' not found!');
    }
    return card;
  }
}