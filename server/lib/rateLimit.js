/* Giới hạn số lần gọi theo khóa (thường là IP) trong một khoảng thời gian, lưu trong bộ nhớ. */
'use strict';

function createRateLimiter(now) {
  now = now || Date.now;
  const buckets = new Map();
  let calls = 0;
  return function limited(key, max, windowMs) {
    const t = now();
    // Thỉnh thoảng dọn các khóa đã hết hạn để bộ nhớ không phình ra
    if (++calls % 500 === 0) for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k);
    const b = buckets.get(key);
    if (!b || b.reset <= t) { buckets.set(key, { n: 1, reset: t + windowMs }); return false; }
    b.n++;
    return b.n > max;
  };
}

module.exports = { createRateLimiter };
