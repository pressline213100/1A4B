/**
 * 產生 n 個不重複的隨機數字 (0-9)
 */
export const generateAnswer = (length = 4) => {
  const numbers = Array.from({ length: 10 }, (_, i) => i.toString());
  const answer = [];
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * numbers.length);
    answer.push(numbers[randomIndex]);
    numbers.splice(randomIndex, 1);
  }
  return answer.join('');
};

/**
 * 計算 nA nB
 * @param {string} answer - 謎底
 * @param {string} guess - 玩家猜測
 */
export const calculateAB = (answer, guess) => {
  let a = 0;
  let b = 0;
  const answerArr = answer.split('');
  const guessArr = guess.split('');

  for (let i = 0; i < answerArr.length; i++) {
    if (guessArr[i] === answerArr[i]) {
      a++;
    } else if (answerArr.includes(guessArr[i])) {
      b++;
    }
  }
  return { a, b };
};

/**
 * 檢查輸入格式
 * @param {string} guess - 玩家猜測
 * @param {number} length - 數字長度
 */
export const validateGuess = (guess, length = 4) => {
  const regex = new RegExp(`^\\d{${length}}$`);
  if (!regex.test(guess)) {
    return `請輸入 ${length} 位數字`;
  }
  const set = new Set(guess);
  if (set.size !== length) {
    return '數字不能重複';
  }
  return null;
};
