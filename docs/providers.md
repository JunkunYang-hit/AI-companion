# Provider 接入与验证边界

2026-10-01补充：DeepSeek在Windows Electron的真实短聊天和自动记忆整理通过，共2次请求，供应商报告输入620、输出77令牌，人民币保守估算0.00160512元。官方人民币价目来自 [模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，缓存输入分别计价；保存核验日期并30天失效，支持官网刷新和用户自定义。旧未知费用保留，不伪装历史实际扣费。以下为2026-09-30的初始协议验证记录。

日期 2026-09-30。UI 一次只选择一个模型，不做多模型路由。默认空模型 ID，用户按控制台填写，预设 URL 可以修改。只有文本能力，手动图片模型输入尚未实现。

| 供应商 | 协议/鉴权 | 当前验证 |
|---|---|---|
| DeepSeek | /chat/completions，Bearer，thinking disabled，stream_options.include_usage | 官方文档与真实 /models 核验；Windows Electron 真实流式调用通过，deepseek-flash，输入 210 / 输出 7 tokens；未配置价格，费用未知 |
| Qwen | OpenAI-compatible，Bearer | 通用协议 fixture 通过；[官方区域/workspace 文档](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)已读。预设旧北京地址可能仍兼容，建议替换为控制台 workspace endpoint，区域 Key 必须匹配；未真实调用 |
| 火山方舟 | /api/v3/chat/completions，Bearer，模型或部署 ID | 通用 fixture 通过；官方导航访问不提供完整 schema，本次具体模型能力未完成核验，未真实调用 |
| GLM | /api/paas/v4/chat/completions，Bearer | 通用 fixture 通过；官方深层页面本次读取失败，具体模型参数仍待核验，未真实调用 |
| Kimi | /v1/chat/completions，Bearer | [官方 Chat 文档](https://platform.kimi.com/docs/api/chat)已核验 moonshot.cn 端点；fixture 通过，未真实调用 |
| OpenAI | /v1/chat/completions，Bearer，max_completion_tokens | [官方创建请求](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)与[流式文档](https://developers.openai.com/api/docs/guides/streaming-responses)已读；fixture 通过，未真实调用；仅兼容 Chat Completions 的模型，不实现 Responses 专有功能 |
| Anthropic | /v1/messages，x-api-key，anthropic-version，独立 system/messages | [官方流式协议](https://platform.claude.com/docs/en/build-with-claude/streaming)已读；message_start + message_delta usage 聚合 fixture 通过，未真实调用 |
| Gemini | /v1beta/openai/chat/completions，Bearer | [官方兼容层](https://ai.google.dev/gemini-api/docs/openai)已读；文本 fixture 通过，未真实调用，不声明所有原生能力 |
| 自定义 | HTTPS Base URL + Bearer + Model | 通用 fixture；不保证所有自称兼容端点支持完全相同的 stream_options 或模型限制 |

不自动重试失败请求，不后台测试连接。401/403、402/429、404、网络、超时、流截断分别给出可见错误。服务端原始错误 body 不打印、不展示，避免回显敏感信息。思考型模型可能在可见文本之前消耗输出预算；此轮 DeepSeek 明确禁用思考，其他模型仍需真实 Key 验证其可用参数。

usage 未提供时标为 unknown。缓存 token 单独记录；目前输入单价保守覆盖缓存，不伪装精确扣费。价目由用户维护，没有硬编码供应商现价。金额预算使用输入 UTF-8 字节数 + 512 token 余量保守预留，以及明确输出上限，单并发；不同 tokenizer 的严格上界仍需供应商级验证，因此费用仅为估算，供应商扣费为准。
