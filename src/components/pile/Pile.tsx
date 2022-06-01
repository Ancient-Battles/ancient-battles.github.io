import * as React from 'react';
import { AttackProps, GameState, Move, MoveProps, PileState } from '../../lib/CardGameEngine';
import { CardDragProps, CardDropResult, CardProps } from '../card/Card';
import './Pile.css';
import ItemTypes from '../../lib/ItemTypes';
import { DropTarget, DropTargetMonitor, ConnectDropTarget } from 'react-dnd';
import { GameProps } from '../../Game';

export interface PileProps {
  id: string;
  name: string;
  css?: React.CSSProperties;
  sort: boolean;
  incoming?: string[];
  unfolded?: boolean;
  showBack?: boolean;
  allowShowFront?: boolean;
  initialShuffle?: boolean;
  lastIncomingMoveValidity?: boolean;
  lastIncomingAttackValidity?: boolean;
  allowInvalidMoves: boolean;
  hasActed?: boolean;
  getGameState: () => GameState;
  getGameProps: () => GameProps;

  // Injected by React DnD:
  isOver: Function;
  canDrop: Function;
  connectDropTarget: ConnectDropTarget;

  // Injected by Game
  makeMove: (moveProps: MoveProps) => void;
  makeAttack: (attackProps: AttackProps) => void;
}

/**
 * Specifies the drop target contract.
 * All methods are optional.
 */
const pileTarget = {
  canDrop(props: PileProps, monitor: DropTargetMonitor): boolean {
    console.log(props.id + ' ' + monitor.isOver({ shallow: true }));
    if (monitor.getItemType() !== ItemTypes.CARD || !monitor.isOver({ shallow: true }) || monitor.didDrop()) {
      return false;
    }
    if (props.allowInvalidMoves === true) {
      return true;
    }

    // You can disallow drop based on props or item
    const item = monitor.getItem() as CardDragProps;
    console.log('checking candrop on ' + props.id);
    if (props.getGameState().piles[item.pileSourceId].hasActed) {
      return false;
    }
    console.log(props.incoming);
    const m = new Move(
      item.pileSourceId,
      props.id,
      item.cardId,
      true,
      props.incoming,
      props.getGameProps()
    );

    return m.isValid(
      props.getGameState()
    );
  },

  drop(props: PileProps, monitor: DropTargetMonitor, component: Pile): CardDropResult {
    console.log('try drop');
    if (monitor.didDrop()) {
      // If you want, you can check whether some nested
      // target already handled drop
      return { done: false };
    }

    // Obtain the dragged item
    const item = monitor.getItem() as CardDragProps;
    // You can do something with it
    // An attack can only occur during BattlesPhase and not between cards of the same pile.
    if (props.getGameState().phase === 'BattlePhase' && item.pileSourceId !== props.id) {
      // Do attack
      let defenderCard = props.getGameState().piles[props.id].cards[0];
      console.error('attacking: ' + item.cardId + 'from ' + item.pileSourceId);
      console.error('to ' + defenderCard + ' in ' + props.id);
      props.makeAttack({
        from: item.pileSourceId,
        to: props.id,
        attackingCard: item.cardId,
        defendingCard: defenderCard,
        incomingRules: props.incoming
      });
    } else {
      // Do move

      console.log('drops: ' + item.cardId + ' from ' + item.pileSourceId + ' to ' + props.id);
      props.makeMove({
        from: item.pileSourceId,
        to: props.id,
        card: item.cardId,
        incomingRules: props.incoming
      });
    }
    
    // You can also do nothing and return a drop result,
    // which will be available as monitor.getDropResult()
    // in the drag source's endDrag() method
    return { done: true };
  }
};

class Pile extends React.Component<PileProps, PileState> {
  static UNFOLD_MAX_ANGEL: number = 25;
  static UNFOLD_ANGEL_PER_CARD_DEGREE: number = 3.5;
  static UNFOLD_RADIUS_PIXEL: number = 1000;

  constructor(props: PileProps) {
    super(props);
    this.state = {
      cards: [],
      isShuffling: false,
      lastIncomingMoveValidity: props.hasOwnProperty('lastIncomingMoveValidity') && props.lastIncomingMoveValidity ?
        props.lastIncomingMoveValidity : false,
      lastIncomingAttackValidity: props.hasOwnProperty('lastIncomingAttackValidity')
       && props.lastIncomingAttackValidity ?
        props.lastIncomingAttackValidity : false,
      showBack: props.hasOwnProperty('showBack') && props.showBack ? props.showBack : false,
      unfolded: props.hasOwnProperty('unfolded') && props.unfolded ? props.unfolded : false,
      hasActed: props.hasOwnProperty('hasActed') && props.hasActed ? props.hasActed : false,
    };
  }

  componentWillReceiveProps(nextProps: PileProps) {
    if (!this.props.isOver && nextProps.isOver) {
      // You can use this as enter handler
    }

    if (this.props.isOver && !nextProps.isOver) {
      // You can use this as leave handler
    }
  }

  render() {
    const childSize = React.Children.count(this.props.children);
    let cPos = 0;

    // These props are injected by React DnD,
    // as defined by your `collect` function above:
    const { isOver, canDrop, connectDropTarget } = this.props;

    const cards = overwritePropOnChildren(
      this.props.children,
      (item) => ({
        startDrag: () => null, // this.childHide.bind(this), // Commented to avoid card showing back when dragged
        endDrag: () => null,
        showBack: this.state.showBack,
        css: this.state.unfolded ? {
          transform: getTransformMatrix(
            Math.min(Pile.UNFOLD_MAX_ANGEL, Pile.UNFOLD_ANGEL_PER_CARD_DEGREE * childSize),
            Pile.UNFOLD_RADIUS_PIXEL,
            childSize,
            cPos++
          )
        } : {}
      })
    );

    return connectDropTarget(
      <div
        className={'pile ' + this.props.id +
          (this.props.lastIncomingMoveValidity === false ? ' last-move-invalid' : '') +
          (isOver && canDrop ? ' can-drop' : '') +
          (isOver && !canDrop ? ' can-not-drop' : '')
        }
        style={this.props.css}
        onClick={() => this.props.allowShowFront ? this.toggleBack() : false}
      >
        <span>{this.props.name}</span>
        {cards}
      </div>
    );
  }

  childHide(): void {
    this.hide();
  }

  childShow(): void {
    this.show();
  }

  show() {
    this.setState((prevState) => ({
      ...prevState,
      ...{showBack: false}
    }));
  }

  hide() {
    this.setState((prevState) => ({
      ...prevState,
      ...{showBack: true}
    }));
  }

  toggleBack() {
    console.log('toggleBack');
    this.setState((prevState) => ({
      ...prevState,
      ...{showBack: !prevState.showBack}
    }));
  }

  toggleFold() {
    this.setState((prevState) => ({
      ...prevState,
      ...{unfolded: !prevState.unfolded}
    }));
  }
}

/* helper functions */

function overwritePropOnChildren(
  children: React.ReactNode,
  props: ((child: React.ReactElement<CardProps>) => object)
): React.ReactElement<CardProps>[] {
  return React.Children.map(
    children,
    (child: React.ReactElement<CardProps>) => {
      return React.cloneElement(child, props(child));
    }
  );
}

function getTransformMatrix(angel: number, radius: number, amount: number, index: number): string {

  // switch order direction
  index = amount - index;

  // calculate distance to center and angel step
  const di = (index - (amount + 1) / 2);
  const as = angel / (amount - 1);
  // calculate angel for this index
  const ai = as * di;

  // calculate transformation matrix, do a Z-rotation
  const h1 = Math.sin(ai / 180 * Math.PI);
  const h2 = -h1;
  const h3 = Math.cos(ai / 180 * Math.PI);
  // and a x/y translation
  const t1 = - radius * h1;
  const t2 = radius * (1 - h3);

  return 'matrix3d(' +
    h3 + ',' + h2 + ',0,0,' +
    h1 + ',' + h3 + ',0,0,' +
    '0,0,1,0,' +
    t1 + ',' + t2 + ',0,1' +
    ')';
}

export default DropTarget(ItemTypes.CARD, pileTarget, (connect, monitor) => ({
  // Call this function inside render()
  // to let React DnD handle the drag events:
  connectDropTarget: connect.dropTarget(),
  // You can ask the monitor about the current drag state:
  isOver: monitor.isOver(),
  isOverCurrent: monitor.isOver({ shallow: true }),
  canDrop: monitor.canDrop(),
  itemType: monitor.getItemType()
}))(Pile);
