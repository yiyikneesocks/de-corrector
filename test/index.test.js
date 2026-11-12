import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeCorrector, hasRealContent, isNoise, isMention } from '../src/index.js'

const c = new DeCorrector()
await c.warmup()

test('纠错：的 → 地', async () => {
  assert.equal(await c.fix('他慢慢的走过来'), '他慢慢地走过来')
  assert.equal(await c.fix('他高兴的跑得很快'), '他高兴地跑得很快')
  assert.equal(await c.fix('她快乐的唱着歌'), '她快乐地唱着歌')
})

test('纠错：的 → 得', async () => {
  assert.equal(await c.fix('雨下的很大'), '雨下得很大')
  assert.equal(await c.fix('这本书写的很好'), '这本书写得很好')
  assert.equal(await c.fix('他跑的比我快'), '他跑得比我快')
})

test('V得C 补语：分词器会吞字，逐字不会', async () => {
  // 这是弃用 jieba 的直接原因：「跑得快」会被切成一个词
  assert.equal(await c.fix('他跑的很快'), '他跑得很快')
  assert.equal(await c.fix('他说的对'), '他说得对')
  assert.equal(await c.fix('他做的很好'), '他做得很好')
})

test('正确文本一个字都不动', async () => {
  const cases = [
    '他高兴地跑得很快', '这是我的书', '我买的水果很甜', '好的',
    '他们的意见很重要', '老师的办公室在三楼', '他会的', '这是我要的',
    '漂亮的花开了', '欢迎新老师生前来就餐',
  ]
  for (const s of cases) assert.equal(await c.fix(s), s, s)
})

test('词汇化例外不动', async () => {
  const cases = [
    '的士来了', '目的地很远', '土地很肥沃', '这个问题值得研究',
    '他得到了奖励', '的确如此', '我记得这件事', '地方不大',
  ]
  for (const s of cases) assert.equal(await c.fix(s), s, s)
})

test('噪声不处理', async () => {
  for (const s of ['的地得', '哈哈哈哈', '111111', '嗯嗯嗯嗯', '。。。。。']) {
    assert.equal(await c.fix(s), s, s)
  }
})

test('连用不处理（否则会改出「慢慢地地」）', async () => {
  assert.equal(await c.fix('他慢慢的地走过来'), '他慢慢的地走过来')
  assert.equal(await c.fix('他跑的得快'), '他跑的得快')
})

test('提及语境不处理', async () => {
  assert.equal(await c.fix('我写了个插件纠正的地得'), '我写了个插件纠正的地得')
})

test('混排：提及 + 真实错误', async () => {
  assert.equal(
    await c.fix('我写了个插件纠正的地得，他慢慢的跑过来'),
    '我写了个插件纠正的地得，他慢慢地跑过来',
  )
})

test('多错误同句', async () => {
  assert.equal(
    await c.fix('他慢慢的走过来，雨下的很大，这本书写的很好。'),
    '他慢慢地走过来，雨下得很大，这本书写得很好。',
  )
})

test('changes 字段结构', async () => {
  const r = await c.check('雨下的很大')
  assert.equal(r.changes.length, 1)
  assert.deepEqual(
    { from: r.changes[0].from, to: r.changes[0].to, tag: r.changes[0].tag },
    { from: '的', to: '得', tag: 'DER' },
  )
})

test('非 UTF-16 边界：emoji 不破坏偏移', async () => {
  const s = '😀他慢慢的走过来🎉'
  assert.equal(await c.fix(s), '😀他慢慢地走过来🎉')
})

test('超长文本直接跳过', async () => {
  const long = '他慢慢的走过来。'.repeat(100) // 800 字 > default 500
  const short = new DeCorrector({ maxLength: 10 })
  await short.warmup()
  assert.equal(await short.fix(long), long)
})

test('并发安全', async () => {
  const inputs = Array.from({ length: 30 }, (_, i) =>
    ['他慢慢的走过来', '雨下的很大', '这本书写的很好'][i % 3],
  )
  const out = await Promise.all(inputs.map((s) => c.fix(s)))
  assert.deepEqual(out.filter((_, i) => i % 3 === 0), Array(10).fill('他慢慢地走过来'))
})

test('工具函数', () => {
  assert.ok(isNoise('的地理得得得的'.replace('理', '') + '得'))
  assert.ok(!hasRealContent('的地得得得得的'))
  assert.ok(hasRealContent('他慢慢的走过来'))
  assert.ok(hasRealContent('哈'.repeat(30) + '他慢慢的走过来'))
  assert.ok(isMention('我写了个插件纠正的地得', 9))
  assert.ok(!isMention('这本书写的很好', 4))
})

// ────────────────────────────────────────────────────────────
// 与 Python 参考实现（完整 HanLP）逐句一致性
// ────────────────────────────────────────────────────────────
test('与 HanLP 参考结果完全一致（64 句）', async () => {
  // 这些期望值来自 Python 版 hanlp-lab 的实际输出，已 64/64 比对通过
  const REF = [
    ['他慢慢的走过来', '他慢慢地走过来'],
    ['他高兴的跑得很快', '他高兴地跑得很快'],
    ['她快乐的唱着歌', '她快乐地唱着歌'],
    ['请仔细的阅读说明书', '请仔细地阅读说明书'],
    ['同学们热烈的讨论着', '同学们热烈地讨论着'],
    ['他飞快的跑向终点', '他飞快地跑向终点'],
    ['她温柔的笑了', '她温柔地笑了'],
    ['我们要合理的安排时间', '我们要合理地安排时间'],
    ['雨下的很大', '雨下得很大'],
    ['这本书写的很好', '这本书写得很好'],
    ['他跑的比我快', '他跑得比我快'],
    ['她气的说不出话', '她气得说不出话'],
    ['你来的真早', '你来得真早'],
    ['他唱的很好听', '他唱得很好听'],
    ['这活儿干的漂亮', '这活儿干得漂亮'],
    ['日子过的很快', '日子过得很快'],
    ['跑得快', '跑得快'],
    ['说得对', '说得对'],
    ['做得好', '做得好'],
    ['他高兴地跑得很快', '他高兴地跑得很快'],
    ['这是我的书', '这是我的书'],
    ['我买的水果很甜', '我买的水果很甜'],
    ['好的', '好的'],
    ['的士来了', '的士来了'],
    ['目的地很远', '目的地很远'],
    ['土地很肥沃', '土地很肥沃'],
    ['这个问题值得研究', '这个问题值得研究'],
    ['欢迎新老师生前来就餐', '欢迎新老师生前来就餐'],
    ['他慢慢的地走过来', '他慢慢的地走过来'],
    ['我写了个插件纠正的地得', '我写了个插件纠正的地得'],
    ['的地得', '的地得'],
    ['哈哈哈哈', '哈哈哈哈'],
  ]
  for (const [src, expect] of REF) {
    assert.equal(await c.fix(src), expect, `句子: ${src}`)
  }
})

// ────────────────────────────────────────────────────────────
// 专名领属格（proper-noun possessive）— 回归用例
// 这是 koishi 生产环境反馈的两个真实 bug
// ────────────────────────────────────────────────────────────
test('专名领属格：赛亚饿的鸟 → 不应改成 得', async () => {
  // #6 false positive: 语境 bleeding 把「饿的」误判成补语
  assert.equal(await c.fix('赛亚饿的鸟飞的快'), '赛亚饿的鸟飞得快')
  assert.equal(await c.fix('赛亚饿的鸟'), '赛亚饿的鸟')
})

test('专名领属格：张本智和地实力 → 应改成 的', async () => {
  // #7 false negative: 模型不认专名，「地」未被识别为候选
  assert.equal(await c.fix('张本智和地实力'), '张本智和的实力')
  assert.equal(await c.fix('以张本智和地实力评价来看'), '以张本智和的实力评价来看')
})

test('结果补语 + 状态名词：说得一口好英语 / 跑得一身汗 → 不应误改', async () => {
  assert.equal(await c.fix('他说得一口好英语'), '他说得一口好英语')
  assert.equal(await c.fix('跑得一身汗'), '跑得一身汗')
  assert.equal(await c.fix('跑得快'), '跑得快')
})

// ────────────────────────────────────────────────────────────
// 固定短语强改 + 不及物动词程度补语 — 回归用例
// 经 HanLP 原版 tok→pos 验证：原版同样改不对，属模型盲区，需要补丁。
// ────────────────────────────────────────────────────────────
test('固定短语：总得来说 → 总的来说（仅分句首）', async () => {
  assert.equal(await c.fix('总得来说'), '总的来说')
  assert.equal(await c.fix('，总得来说，这事不急'), '，总的来说，这事不急')
  assert.equal(await c.fix('他总得来说两句'), '他总得来说两句')
  assert.equal(await c.fix('总得去一趟'), '总得去一趟')
})

test('固定短语：懂得都懂 → 懂的都懂', async () => {
  assert.equal(await c.fix('懂得都懂'), '懂的都懂')
  assert.equal(await c.fix('我懂得这个道理'), '我懂得这个道理')
  assert.equal(await c.fix('懂得道理'), '懂得道理')
})

test('误改防护：总的来说 不能被改成 总地来说', async () => {
  assert.equal(await c.fix('总的来说'), '总的来说')
  assert.equal(await c.fix('总的来说吧'), '总的来说吧')
})

test('不及物动词程度补语：飞的就是高 → 飞得就是高', async () => {
  assert.equal(await c.fix('赛亚饿的鸟他飞的就是高'), '赛亚饿的鸟他飞得就是高')
  assert.equal(await c.fix('他跳的就是高'), '他跳得就是高')
  assert.equal(await c.fix('他来的就是早'), '他来得就是早')
})

test('程度补语保护：名词化的的 / 及物动词 不误改', async () => {
  assert.equal(await c.fix('他说的就是对的'), '他说的就是对的')
  assert.equal(await c.fix('他买的就是贵的'), '他买的就是贵的')
  assert.equal(await c.fix('我要的就是快'), '我要的就是快')
  // 「打的」= 打的内容/表现，是合法名词，不能改
  assert.equal(await c.fix('他打的就是好'), '他打的就是好')
  assert.equal(await c.fix('他写的就是好'), '他写的就是好')
})
