import isFunction from 'lodash/isFunction';
import { CartesianTickItem, Size } from '../util/types';
import { mathSign, isNumber } from '../util/DataUtils';
import { getStringSize } from '../util/DOMUtils';
import { Props as CartesianAxisProps } from './CartesianAxis';
import { Global } from '../util/Global';
import { isVisible, getTickBoundaries, getNumberIntervalTicks, getAngledTickWidth } from '../util/TickUtils';
import { getEquidistantTicks } from './getEquidistantTicks';

export type Sign = 0 | 1 | -1;

function getTicksEndBinarySearch(
  sign: Sign,
  boundaries: { start: number; end: number },
  getTickSize: (tick: CartesianTickItem, index: number) => number,
  ticks: CartesianTickItem[],
  minTickGap: number,
) {
  const result = (ticks || []).slice();
  const len = result.length;

  const { start } = boundaries;
  let { end } = boundaries;

  let initialEntry = result[len - 1];
  const entrySize = getTickSize(initialEntry, len - 1);
  const gap = sign * (initialEntry.coordinate + (sign * entrySize) / 2 - end);
  result[len - 1] = initialEntry = {
    ...initialEntry,
    tickCoord: gap > 0 ? initialEntry.coordinate - gap * sign : initialEntry.coordinate,
  };

  let isShow = isVisible(sign, initialEntry.tickCoord, () => entrySize, start, end);

  if (isShow) {
    end = initialEntry.tickCoord - sign * (entrySize / 2 + minTickGap);
    result[len - 1] = { ...initialEntry, isShow: true };
  }

  let startIndex = result.length - 2;
  let endIndex = 0;

  // Iterate while start not meets end
  while (startIndex >= endIndex) {
    // Find the mid index
    const mid = Math.floor((startIndex + endIndex) / 2);

    let entry = result[mid];
    result[mid] = entry = { ...entry, tickCoord: entry.coordinate };

    let size: number | undefined;
    const getSize = () => {
      if (size === undefined) {
        size = getTickSize(entry, mid);
      }

      return size;
    };

    isShow = isVisible(sign, entry.tickCoord, getSize, start, end);
    console.log({ isShow, startIndex, mid, endIndex });
    if (isShow && (startIndex === endIndex + 1 || startIndex === endIndex)) {
      end = entry.tickCoord - sign * (getSize() / 2 + minTickGap);
      result[mid] = { ...entry, isShow: true };

      // Continue loop starting from the item next to this one
      startIndex = mid - 1;
      endIndex = 0;
    } else if (isShow) {
      endIndex = mid;
    } else {
      startIndex = mid - 1;
    }
  }

  return result;
}

function getTicksEnd(
  sign: Sign,
  boundaries: { start: number; end: number },
  getTickSize: (tick: CartesianTickItem, index: number) => number,
  ticks: CartesianTickItem[],
  minTickGap: number,
): CartesianTickItem[] {
  console.log('getTicksEnd', {
    sign,
    boundaries,
    getTickSize,
    ticks,
    minTickGap,
  });
  const result = (ticks || []).slice();
  const len = result.length;

  const { start } = boundaries;
  let { end } = boundaries;

  for (let i = len - 1; i >= 0; i--) {
    let entry = result[i];
    let size: number | undefined;
    const getSize = () => {
      if (size === undefined) {
        size = getTickSize(entry, i);
      }

      return size;
    };

    if (i === len - 1) {
      const gap = sign * (entry.coordinate + (sign * getSize()) / 2 - end);
      result[i] = entry = {
        ...entry,
        tickCoord: gap > 0 ? entry.coordinate - gap * sign : entry.coordinate,
      };
    } else {
      result[i] = entry = { ...entry, tickCoord: entry.coordinate };
    }

    const isShow = isVisible(sign, entry.tickCoord, getSize, start, end);
    console.log({ i, sign, entry, start, end, isShow });

    if (isShow) {
      end = entry.tickCoord - sign * (getSize() / 2 + minTickGap);
      result[i] = { ...entry, isShow: true };
    }
  }

  const copy = getTicksEndBinarySearch(sign, boundaries, getTickSize, ticks, minTickGap);
  console.log({
    original: result,
    copy,
    originalTicks: result.filter(tick => tick.isShow),
    copyTicks: copy.filter(tick => tick.isShow),
  });

  return result;
}

function getTicksStart(
  sign: Sign,
  boundaries: { start: number; end: number },
  getTickSize: (tick: CartesianTickItem, index: number) => number,
  ticks: CartesianTickItem[],
  minTickGap: number,
  preserveEnd?: boolean,
): CartesianTickItem[] {
  const result = (ticks || []).slice();
  const len = result.length;

  let { start, end } = boundaries;

  if (preserveEnd) {
    // Try to guarantee the tail to be displayed
    let tail = ticks[len - 1];
    const tailSize = getTickSize(tail, len - 1);
    const tailGap = sign * (tail.coordinate + (sign * tailSize) / 2 - end);
    result[len - 1] = tail = {
      ...tail,
      tickCoord: tailGap > 0 ? tail.coordinate - tailGap * sign : tail.coordinate,
    };

    const isTailShow = isVisible(sign, tail.tickCoord, () => tailSize, start, end);

    if (isTailShow) {
      end = tail.tickCoord - sign * (tailSize / 2 + minTickGap);
      result[len - 1] = { ...tail, isShow: true };
    }
  }

  const count = preserveEnd ? len - 1 : len;
  for (let i = 0; i < count; i++) {
    let entry = result[i];
    let size: number | undefined;
    const getSize = () => {
      if (size === undefined) {
        size = getTickSize(entry, i);
      }

      return size;
    };

    if (i === 0) {
      const gap = sign * (entry.coordinate - (sign * getSize()) / 2 - start);
      result[i] = entry = {
        ...entry,
        tickCoord: gap < 0 ? entry.coordinate - gap * sign : entry.coordinate,
      };
    } else {
      result[i] = entry = { ...entry, tickCoord: entry.coordinate };
    }

    const isShow = isVisible(sign, entry.tickCoord, getSize, start, end);

    if (isShow) {
      start = entry.tickCoord + sign * (getSize() / 2 + minTickGap);
      result[i] = { ...entry, isShow: true };
    }
  }

  return result;
}

export function getTicks(props: CartesianAxisProps, fontSize?: string, letterSpacing?: string): any[] {
  const { tick, ticks, viewBox, minTickGap, orientation, interval, tickFormatter, unit, angle } = props;
  console.log(ticks, props);

  if (!ticks || !ticks.length || !tick) {
    return [];
  }

  if (isNumber(interval) || Global.isSsr) {
    return getNumberIntervalTicks(ticks, typeof interval === 'number' && isNumber(interval) ? interval : 0);
  }

  let candidates: CartesianTickItem[] = [];

  const sizeKey = orientation === 'top' || orientation === 'bottom' ? 'width' : 'height';
  const unitSize: Size =
    unit && sizeKey === 'width' ? getStringSize(unit, { fontSize, letterSpacing }) : { width: 0, height: 0 };

  const getTickSize = (content: CartesianTickItem, index: number) => {
    const value = isFunction(tickFormatter) ? tickFormatter(content.value, index) : content.value;
    // Recharts only supports angles when sizeKey === 'width'
    return sizeKey === 'width'
      ? getAngledTickWidth(getStringSize(value, { fontSize, letterSpacing }), unitSize, angle)
      : getStringSize(value, { fontSize, letterSpacing })[sizeKey];
  };

  const sign = ticks.length >= 2 ? mathSign(ticks[1].coordinate - ticks[0].coordinate) : 1;
  const boundaries = getTickBoundaries(viewBox, sign, sizeKey);

  if (interval === 'equidistantPreserveStart') {
    return getEquidistantTicks(sign, boundaries, getTickSize, ticks, minTickGap);
  }

  if (interval === 'preserveStart' || interval === 'preserveStartEnd') {
    candidates = getTicksStart(sign, boundaries, getTickSize, ticks, minTickGap, interval === 'preserveStartEnd');
  } else {
    candidates = getTicksEnd(sign, boundaries, getTickSize, ticks, minTickGap);
  }

  return candidates.filter(entry => entry.isShow);
}
