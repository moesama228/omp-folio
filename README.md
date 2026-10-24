# omp Folio

`▎` 左侧输入 · `⏱` 订阅额度 · `$` 余额 · `≡` 原生状态栏

一个 omp **Composer Shape 插件**：输入区保持 omp 原有行为，额度/余额显示在右侧或顶部账签，下方交还给 omp 原生状态栏。面向 omp **18.12.6** 的普通 ANSI 终端。

## 安装

本地开发使用 link：

```sh
omp plugin install /path/to/omp_composer
```

从 npm 安装：

```sh
omp plugin install npm:omp-folio
```

从 GitHub 安装：

```sh
omp plugin install github:moesama228/omp-folio
```

需要可复现时，钉首个自动发布后的 tag，例如 `#v0.1.1`。

也可以在项目里临时加载：

```sh
omp --extension /path/to/omp_composer/index.ts
```

安装后在 **Appearance → Composer Shape** 选择 Folio Gutter、Folio Gauge 或 Folio Capline，或直接写全局配置：

```sh
omp config set composer.shape omp-composer-folio-gutter
omp config set composer.shape omp-composer-folio-gauge
omp config set composer.shape omp-composer-folio-capline
```

- 全局安装后不要再保留项目里的 `.omp/extensions/folio.ts`，否则会重复加载。
- 旧配置 `composer.shape: omp-composer-dock` 会在首次加载时自动迁移到新 id。
- GitHub 安装是克隆，不是 link；更新后重装新 tag 或运行 `omp plugin upgrade`。
- npm 安装使用 `omp-folio` 包；首次发布前需要先完成 npm 包配置。

## 布局

- `▎` **输入**：编辑、Vim、历史、补全、粘贴、IME 和滚动全部沿用 omp。

| Shape | 布局 |
| --- | --- |
| `Folio Gutter` | 现有右侧额度轨，只显示标签和数值 |
| `Folio Gauge` | 右侧余量刻度，百分比同时显示为最多 10 格方块 |
| `Folio Capline` | 顶部额度账签，输入使用完整宽度；空间不足时按完整额度项换行，单项自身超宽时再按列折行 |

- `⏱` / `$` **额度栏**：无分隔线；图标沿用 session accent，数值加粗并右对齐。订阅显示 `⏱ 7d 60%`，余额显示 `$ ¥42.00`。
- `≡` **状态栏**：使用 omp 原生 preset，不在插件里重写 model、mode、path、git、pr、context、cost、session 等 segment。
- **宽度**：Gutter / Gauge 在 88 列起左右分栏，额度栏 22–26 列；窄屏或 `tui.imeSafeCursor` 时放在输入下方。Capline 始终放在输入上方，不占光标右侧。
- **留白**：Gutter / Gauge 在输入上下各留 1 行空白 rail；Capline 用顶部账签替代上空白，保留底部空白 rail。
- **颜色**：左侧 rail 跟随 `statusLine.sessionAccent`；关闭该设置后回到主题 accent。

## Provider 与额度样式

额度读取宿主 `authStorage.usage.reports()`；DeepSeek 例外，读取官方余额端点。

| Provider | 额度栏显示 |
| --- | --- |
| `anthropic` | `⏱ 5h 82%`、`⏱ 7d 64%`；只显示报告里的窗口 |
| `openai-codex` | `⏱ 5h 86%`、`⏱ 7d 78%`；不补不存在的窗口 |
| `kimi-code` | `⏱ 5h 100%`、`⏱ 7d 61%` |
| `cursor` | `⏱ auto 84%`、`⏱ api 72%`、`⏱ plan …`；按当前模型选 auto/API pool |
| `xai-oauth` / `xai` | `⏱ 7d 60%`、`⏱ 1mo 80%`；不含 on-demand cap |
| `google-antigravity` | `⏱ 1d …`、`⏱ 7d …`；按当前模型选 counter |
| `devin` | `⏱ prompt/flow/flex …`、`⏱ 1d/7d …`；credits + daily/weekly quota |
| `deepseek` | `$ ¥42.00`；绝对余额，无百分比 |
| 其他 / 不支持 | 有可解析报告：`⏱ <窗口> <剩余>%`；否则 `⏱ 未知` |

- 百分比是**剩余份额**：`100%` 满额，`0%` 用完；`≤25%` / `≤10%` 显示 warning/error。多个账号无法确认时显示 `⏱ 多账号`，不会相加。
- Gauge 只为已知百分比绘制刻度，正常刻度使用 session accent；余额、未知和失败不伪造刻度。Capline 换行和极窄折行不会丢弃额度项。
- 请求失败显示 `⏱ 获取失败`；数据超过 10 分钟追加 `⚠ 过期`；缺失数据不会被当成 100%。DeepSeek 账户不可用时追加 `⚠ 不可用`。
- DeepSeek 成功缓存 5 分钟、失败缓存 30 秒；API key 不进入日志或错误信息。其他 provider 读取宿主缓存，不逐帧联网。

## 验证

```sh
./node_modules/.bin/tsc --noEmit
BUN_BE_BUN=1 omp test ./src/quota.test.ts ./src/quota-panel.test.ts ./src/register.test.ts
```

当前结果：34 个测试全部通过。真实 omp 18.12.6 PTY 已验证 Gauge 的 120/88/87/70 列、Capline 的 120/70/20/16 列、原生状态栏、真实 Kimi 额度、IME-safe override、Appearance 往返切换、原生编辑序列和退出最终帧。

## 兼容边界

- 实现与 **18.12.6** 对齐；升级 omp 后应更新依赖并重跑类型检查和 PTY 验证。
- omp 在扩展加载前绘制的启动首帧仍可能回退为 `box`，插件无法早于宿主预绘制执行。
- 没有修改 omp 源码或二进制；TSP/Tern 原生 composer 不承诺复现这里的分栏外形。

## Releasing

```sh
npm version patch
git push --follow-tags
```

推送 `v*` tag 后，`.github/workflows/publish.yml` 会运行类型检查、测试并发布到 npm。

开发约定和设计决定见 [AGENTS.md](AGENTS.md)。
