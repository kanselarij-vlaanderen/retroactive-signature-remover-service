const chunkify = (input, size) => {
  return input.reduce((arr, item, idx) => {
    return idx % size === 0
      ? [...arr, [item]]
      : [...arr.slice(0, -1), [...arr.slice(-1)[0], item]];
  }, []);
};

const sleep = async (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export {
  chunkify,
  sleep,
}