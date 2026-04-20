/**
 * test6-fixtures.ts
 *
 * 基于 test6 项目真实 LLM ingest 输出重建的 Fixture 数据。
 * 包含"正确的 LLM 输出"和"有 Bug 的 LLM 输出"两类，
 * 用于测试各种 ingest 时序/重试/并发场景。
 *
 * Bug 模式来源于真实的 test6 文件系统观察：
 *   - 内容重复：韩松.md 与 珠海奥乐医院.md 包含完全相同的内容（肺结节内容）
 *   - 内容错位：ALT升高.md 拿到了 肥胖 的内容（逐一错位）
 *   - 跨源污染：2023目录文件包含来自 2025 source 的 sources 字段
 */

// ─── 2023体检报告：正确的 LLM 输出 ─────────────────────────────────────────

export const CORRECT_2023 = `---FILE: wiki/sources/2023体检报告.md---
---
title: 2023体检报告
sources: ["2023体检报告.pdf"]
---

2023年体检报告汇总，包含韩松在珠海奥乐医院的体检结果。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
created: 2026-04-19
updated: 2026-04-19
tags: [人物, 体检对象, 健康档案]
related:
  - [[2023体检报告]]
  - [[珠海奥乐医院]]
sources: ["2023体检报告.pdf"]
---

# 简介

[[韩松]]是本份[[2023体检报告]]的受检者，于2023年在[[珠海奥乐医院]]完成年度健康体检。

# 基本信息

- 身高：178.5 cm
- 体重：93 kg
- BMI：29.2（达到肥胖标准，BMI ≥ 28）

# 本次体检主要发现

本次体检的主要结论包括：[[肥胖]]、[[高脂血症]]、[[轻度脂肪肝]]、[[ALT升高]]、[[肺结节]]（右肺）、[[胆囊多发结石]]、[[双肾结石]]以及[[甲状腺弥漫性回声改变]]。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
created: 2026-04-19
updated: 2026-04-19
tags: [医疗机构, 体检机构, 报告来源]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 简介

[[珠海奥乐医院]]是本次[[2023体检报告]]的出具机构，负责完成体检项目、汇总各科室结果，并形成最终报告。

# 机构定位

该机构在本次文档中的定位为健康筛查机构，提供风险提示与健康管理建议。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/ALT升高.md---
---
type: concept
title: ALT升高
created: 2026-04-19
updated: 2026-04-19
tags: [肝功能, ALT, 实验室异常]
related:
  - [[2023体检报告]]
  - [[韩松]]
  - [[轻度脂肪肝]]
sources: ["2023体检报告.pdf"]
---

# 定义

ALT（丙氨酸氨基转移酶）升高指血液中ALT水平超过正常参考范围上限，是反映肝细胞损伤的敏感指标。

# 在本来源中的表现

《[[2023体检报告]]》中，ALT升高是肝功能检查的主要异常发现，与[[轻度脂肪肝]]共同出现。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/双肾结石.md---
---
type: concept
title: 双肾结石
created: 2026-04-19
updated: 2026-04-19
tags: [肾脏, 泌尿系统, 超声异常]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 定义

双肾结石指双侧肾脏内均存在结石，为泌尿系统常见病变。

# 在本来源中的表现

《[[2023体检报告]]》中，双肾彩超提示双侧肾脏均见结石影像。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/甲状腺弥漫性回声改变.md---
---
type: concept
title: 甲状腺弥漫性回声改变
created: 2026-04-19
updated: 2026-04-19
tags: [甲状腺, 超声异常, 待复查]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 定义

[[甲状腺弥漫性回声改变]]指甲状腺实质在超声上呈现回声不均匀、散在低回声区等弥漫性异常表现。

# 在本来源中的表现

《[[2023体检报告]]》甲状腺彩超提示实质回声不均，内散在多个小片状回声减低区，建议结合化验。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/肥胖.md---
---
type: concept
title: 肥胖
created: 2026-04-19
updated: 2026-04-19
tags: [代谢风险, 体重管理, 慢病风险]
related:
  - [[2023体检报告]]
  - [[韩松]]
  - [[高脂血症]]
  - [[轻度脂肪肝]]
  - [[ALT升高]]
sources: ["2023体检报告.pdf"]
---

# 定义

[[肥胖]]通常指BMI达到肥胖范围（≥28 kg/m²）。本来源中[[韩松]]的BMI为29.2，属于肥胖。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/肺结节.md---
---
type: concept
title: 肺结节
created: 2026-04-19
updated: 2026-04-19
tags: [胸部CT, 影像学异常, 随访]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 定义

[[肺结节]]是指肺内直径不超过3cm的类圆形或不规则局灶性病灶。

# 在本来源中的表现

右肺上叶后段胸膜下约3-4mm边缘清晰结节，多考虑炎性结节，建议定期复查。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/胆囊多发结石.md---
---
type: concept
title: 胆囊多发结石
created: 2026-04-19
updated: 2026-04-19
tags: [胆囊, 结石, 消化系统]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 定义

胆囊多发结石指胆囊内存在多个结石。

# 在本来源中的表现

《[[2023体检报告]]》肝胆脾胰彩超提示胆囊内见多个强回声光团伴声影。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/轻度脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
created: 2026-04-19
updated: 2026-04-19
tags: [脂肪肝, 肝脏异常, 代谢相关]
related:
  - [[2023体检报告]]
  - [[韩松]]
  - [[肥胖]]
  - [[高脂血症]]
sources: ["2023体检报告.pdf"]
---

# 定义

[[轻度脂肪肝]]是指肝脏脂肪沉积达到影像学可见程度，但总体程度较轻。

# 在本来源中的表现

《[[2023体检报告]]》肝胆脾胰彩超提示肝脏实质回声增强、细密，分布不均匀。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/高脂血症.md---
---
type: concept
title: 高脂血症
created: 2026-04-19
updated: 2026-04-19
tags: [血脂, 代谢异常, 慢病风险]
related:
  - [[2023体检报告]]
  - [[韩松]]
  - [[肥胖]]
sources: ["2023体检报告.pdf"]
---

# 定义

[[高脂血症]]指血脂水平超过正常范围，是心脑血管疾病的重要风险因素。
---END FILE---`

// ─── 2023体检报告：有 Bug 的 LLM 输出（基于 test6 真实文件反向推导）─────────

/**
 * Bug 类型 A：内容重复 + 路径-内容错配
 * 两个实体文件都拿到了"肺结节"的内容（LLM 路径与 title 不匹配）
 */
export const BUGGY_2023_DUPLICATE_ENTITY = `---FILE: wiki/sources/2023体检报告.md---
---
title: 2023体检报告
sources: ["2023体检报告.pdf"]
---

2023年体检报告汇总。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
created: 2026-04-19
updated: 2026-04-19
tags: [胸部CT, 影像学异常, 随访]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 定义

肺结节是指肺内直径不超过3 cm的类圆形或不规则局灶性病灶。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 珠海奥乐医院
created: 2026-04-19
updated: 2026-04-19
tags: [胸部CT, 影像学异常, 随访]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

# 定义

肺结节是指肺内直径不超过3 cm的类圆形或不规则局灶性病灶。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/ALT升高.md---
---
type: concept
title: 肥胖
created: 2026-04-19
updated: 2026-04-19
tags: [代谢风险, 体重管理, 慢病风险]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

肥胖的内容被写入了 ALT升高.md 路径。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/肺结节.md---
---
type: concept
title: 肥胖
created: 2026-04-19
updated: 2026-04-19
tags: [代谢风险, 体重管理, 慢病风险]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---

同一肥胖内容也被写入了肺结节.md 路径。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/轻度脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
created: 2026-04-19
updated: 2026-04-19
tags: [脂肪肝, 肝脏异常, 代谢相关]
sources: ["2023体检报告.pdf"]
---

轻度脂肪肝内容正确。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/高脂血症.md---
---
type: concept
title: 轻度脂肪肝
created: 2026-04-19
updated: 2026-04-19
tags: [脂肪肝, 肝脏异常, 代谢相关]
sources: ["2023体检报告.pdf"]
---

高脂血症.md 拿到了轻度脂肪肝的内容。
---END FILE---`

/**
 * Bug 类型 B：内容逐一错位（每个文件拿到了下一个文件的内容）
 * 模拟 LLM 输出中 path 与 content block 顺序不匹配
 */
export const BUGGY_2023_SHIFT = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 珠海奥乐医院
sources: ["2023体检报告.pdf"]
---
珠海奥乐医院的内容写入了韩松.md。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
sources: ["2023体检报告.pdf"]
---
正确。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/ALT升高.md---
---
type: concept
title: 双肾结石
sources: ["2023体检报告.pdf"]
---
双肾结石内容写入ALT升高.md。
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/双肾结石.md---
---
type: concept
title: 甲状腺弥漫性回声改变
sources: ["2023体检报告.pdf"]
---
甲状腺内容写入双肾结石.md。
---END FILE---`

// ─── 2025体检报告：正确的 LLM 输出 ─────────────────────────────────────────

export const CORRECT_2025 = `---FILE: wiki/sources/2025体检报告.md---
---
title: 2025体检报告
sources: ["2025体检报告.pdf"]
---

2025年体检报告汇总。
---END FILE---
---FILE: wiki/sources/2025体检报告/entities/韩松.md---
---
type: entity
title: 韩松
created: 2026-04-19
updated: 2026-04-19
tags: [人物, 体检对象, 健康档案]
related: [[2025体检报告]], [[珠海奥乐医院]]
sources: ["2025体检报告.pdf"]
---

# 简介

[[韩松]]是本份[[2025体检报告]]的受检者。

# 主要发现

本次主要发现包括：[[脂肪肝]]、[[肥胖]]、[[血脂异常]]、[[高尿酸血症]]、[[二尖瓣反流]]、[[室间隔增厚]]等。
---END FILE---
---FILE: wiki/sources/2025体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
created: 2026-04-19
updated: 2026-04-19
tags: [医疗机构, 体检机构, 报告来源]
related: [[2025体检报告]], [[韩松]]
sources: ["2025体检报告.pdf"]
---

# 简介

[[珠海奥乐医院]]是本次[[2025体检报告]]的出具机构。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/丙氨酸氨基转移酶升高.md---
---
type: concept
title: 丙氨酸氨基转移酶升高
tags: [肝功能, ALT, 实验室异常]
related: [[2025体检报告]], [[脂肪肝]], [[肥胖]]
sources: ["2025体检报告.pdf"]
---

ALT（丙氨酸氨基转移酶）升高是肝细胞损伤的敏感指标，本次体检中检出升高。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/二尖瓣反流.md---
---
type: concept
title: 二尖瓣反流
tags: [心脏彩超, 瓣膜, 心脏结构]
related: [[2025体检报告]], [[室间隔增厚]]
sources: ["2025体检报告.pdf"]
---

[[二尖瓣反流]]指二尖瓣关闭不全时血液从左心室向左心房反流，本次体检心脏彩超提示少量反流。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/体检报告解读原则.md---
---
type: concept
title: 体检报告解读原则
tags: [体检, 方法论, 临床参考]
related: [[2025体检报告]], [[肥胖]], [[脂肪肝]], [[血脂异常]]
sources: ["2025体检报告.pdf"]
---

体检报告解读原则是对健康体检结果进行理解时应遵循的基本方法：把体检视为筛查与风险提示工具。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/室间隔增厚.md---
---
type: concept
title: 室间隔增厚
tags: [心脏彩超, 心肌结构, 随访]
related: [[2025体检报告]], [[二尖瓣反流]]
sources: ["2025体检报告.pdf"]
---

[[室间隔增厚]]指室间隔壁厚度超过正常范围，本次体检提示室间隔稍增厚。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/肥胖.md---
---
type: concept
title: 肥胖
tags: [代谢健康, BMI, 风险因素]
related: [[2025体检报告]], [[韩松]], [[脂肪肝]], [[血脂异常]], [[高尿酸血症]]
sources: ["2025体检报告.pdf"]
---

[[肥胖]]（BMI≥28）是本次体检的核心背景风险因素，与多项异常共现。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/肾囊肿.md---
---
type: concept
title: 肾囊肿
tags: [肾脏, 彩超, 囊性病变]
related: [[2025体检报告]], [[高尿酸血症]]
sources: ["2025体检报告.pdf"]
---

[[肾囊肿]]是肾脏内的良性囊性病变，本次超声提示右肾囊肿。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/胆囊结石.md---
---
type: concept
title: 胆囊结石
tags: [胆囊, 彩超, 影像学异常]
related: [[2025体检报告]], [[脂肪肝]]
sources: ["2025体检报告.pdf"]
---

[[胆囊结石]]指胆囊内存在结石。本次体检提示胆囊结石。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/脂肪肝.md---
---
type: concept
title: 脂肪肝
tags: [肝脏, 超声, 代谢异常]
related: [[2025体检报告]], [[肥胖]], [[血脂异常]], [[丙氨酸氨基转移酶升高]]
sources: ["2025体检报告.pdf"]
---

[[脂肪肝]]指肝脏内脂肪过度沉积，本次超声提示脂肪肝。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/血液流变学异常.md---
---
type: concept
title: 血液流变学异常
tags: [血流变, 风险提示, 辅助指标]
related: [[2025体检报告]], [[肥胖]], [[血脂异常]]
sources: ["2025体检报告.pdf"]
---

[[血液流变学异常]]作为辅助线索，不凌驾于肥胖、血脂异常等核心指标之上。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/血脂异常.md---
---
type: concept
title: 血脂异常
tags: [血脂, 代谢异常, 心血管风险]
related: [[2025体检报告]], [[肥胖]], [[脂肪肝]]
sources: ["2025体检报告.pdf"]
---

[[血脂异常]]指血液中血脂水平超过正常范围，本次体检提示血脂多项异常。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/高尿酸血症.md---
---
type: concept
title: 高尿酸血症
tags: [尿酸, 嘌呤代谢, 代谢风险]
related: [[2025体检报告]], [[肥胖]], [[血脂异常]], [[肾囊肿]]
sources: ["2025体检报告.pdf"]
---

[[高尿酸血症]]指血尿酸水平高于参考范围，本次体检尿酸464.5↑。
---END FILE---`

/**
 * Bug 类型 C：跨源 sources 污染
 * 2025 实体文件中的 sources 引用了 2023 年的 PDF
 */
export const BUGGY_2025_CROSS_SOURCE = `---FILE: wiki/sources/2025体检报告/entities/韩松.md---
---
type: entity
title: 珠海奥乐医院
created: 2026-04-19
updated: 2026-04-19
tags: [人物, 体检对象, 健康档案]
related:
  - [[2023体检报告]]
sources: ["2025体检报告.pdf"]
---

韩松的基本信息（但 title 是珠海奥乐医院，路径与内容错配）。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/二尖瓣反流.md---
---
type: concept
title: 体检报告解读原则
tags: [体检, 方法论, 临床参考]
related: [[2025体检报告]], [[肥胖]]
sources: ["2025体检报告.pdf"]
---

体检报告解读原则的内容被写入了 二尖瓣反流.md。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/血脂异常.md---
---
type: concept
title: 高尿酸血症
tags: [肾结石, 泌尿系统, 超声异常]
related:
  - [[2023体检报告]]
sources: ["2023体检报告.pdf"]
---

高尿酸血症内容（来自2023）写入了 血脂异常.md（2025）。
---END FILE---`

// ─── 2024体检报告：正确的 LLM 输出 ─────────────────────────────────────────

export const CORRECT_2024 = `---FILE: wiki/sources/2024体检报告.md---
---
title: 2024体检报告
sources: ["2024体检报告.pdf"]
---

2024年体检报告汇总。
---END FILE---
---FILE: wiki/sources/2024体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
tags: [医疗机构, 体检机构, 报告来源]
related: [[2024体检报告]], [[体检报告解读原则]]
sources: ["2024体检报告.pdf"]
---

[[珠海奥乐医院]]是本次[[2024体检报告]]的出具机构与体检执行机构。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/乙肝两对半结果解读.md---
---
type: concept
title: 乙肝两对半结果解读
tags: [乙肝, 免疫学, 实验室]
sources: ["2024体检报告.pdf"]
---

乙肝两对半是乙型肝炎病毒感染情况及免疫应答的重要参考指标。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/体检报告解读原则.md---
---
type: concept
title: 体检报告解读原则
tags: [体检, 方法论, 临床参考]
sources: ["2024体检报告.pdf"]
---

体检视为筛查与风险提示工具，而不是直接等同于临床确诊。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/肾结石.md---
---
type: concept
title: 肾结石
tags: [肾脏, 泌尿系统, 超声异常]
sources: ["2024体检报告.pdf"]
---

[[肾结石]]指肾脏内矿物质聚集形成的硬块。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/胆囊结石.md---
---
type: concept
title: 胆囊结石
tags: [胆囊, 彩超, 影像学异常]
sources: ["2024体检报告.pdf"]
---

[[胆囊结石]]，本次体检彩超提示。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/超重.md---
---
type: concept
title: 超重
tags: [体重, 代谢健康, BMI]
sources: ["2024体检报告.pdf"]
---

[[超重]]指BMI在24-28之间的体重状态。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/轻度脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
tags: [脂肪肝, 肝脏异常, 代谢相关]
sources: ["2024体检报告.pdf"]
---

[[轻度脂肪肝]]，本次体检超声提示。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/高尿酸血症.md---
---
type: concept
title: 高尿酸血症
tags: [尿酸, 嘌呤代谢, 代谢风险]
sources: ["2024体检报告.pdf"]
---

[[高尿酸血症]]，本次体检尿酸升高。
---END FILE---
---FILE: wiki/sources/2024体检报告/concepts/高脂血症.md---
---
type: concept
title: 高脂血症
tags: [血脂, 代谢异常, 慢病风险]
sources: ["2024体检报告.pdf"]
---

[[高脂血症]]，本次体检血脂异常。
---END FILE---`

/**
 * 跨源混合场景：2025 ingest 在 2023 ingest 完成后进行，
 * 但 2025 的 LLM 输出中混入了 2023 source 的内容
 */
export const BUGGY_2025_AFTER_2023_CONTAMINATION = `---FILE: wiki/sources/2025体检报告/entities/韩松.md---
---
type: entity
title: 韩松
related: [[2023体检报告]]
sources: ["2023体检报告.pdf"]
---

2025年韩松信息，但 sources 错误地引用了 2023 的 PDF。
---END FILE---
---FILE: wiki/sources/2025体检报告/concepts/脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
sources: ["2023体检报告.pdf"]
---

2023年的轻度脂肪肝内容出现在了 2025/concepts/脂肪肝.md 中。
---END FILE---`

/**
 * 缺失 ---END FILE--- 的 LLM 输出（模拟 LLM 偶尔忘记写终止标记的场景）
 */
export const MISSING_END_FILE_OUTPUT = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
韩松实体内容（无 END FILE）
---FILE: wiki/sources/2023体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
sources: ["2023体检报告.pdf"]
---
珠海奥乐医院实体内容（有 END FILE）
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/肥胖.md---
---
type: concept
title: 肥胖
sources: ["2023体检报告.pdf"]
---
肥胖概念内容（无 END FILE）
---FILE: wiki/sources/2023体检报告/concepts/轻度脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
sources: ["2023体检报告.pdf"]
---
轻度脂肪肝内容（最后一个，无 END FILE）`

/**
 * 重试场景：第一次 ingest 内容错误，第二次 ingest 输出正确内容。
 * 用于测试重试时正确内容是否覆盖错误内容。
 */
export const RETRY_FIRST_WRONG_2023 = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 珠海奥乐医院
sources: ["2023体检报告.pdf"]
---
错误：韩松.md 被写入了珠海奥乐医院的内容。
---END FILE---`

export const RETRY_SECOND_CORRECT_2023 = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
正确：韩松.md 被写入了韩松的内容。
---END FILE---`

// ─── Test6 第二轮运行观察到的真实 Bug Fixtures（2026-04-19）────────────────────
//
// Bug 类型汇总：
//   SUMMARY_SWAP    - 汇总页路径与内容完全互换（跨源）
//   CONTENT_SHIFT   - 同源内容错位（每个文件包含下一个文件的内容）
//   CROSS_SOURCE_ENTITY - 实体内容来自另一个源
//   CROSS_SOURCE_BOTH   - 标题 + sources 均来自另一个源
//
// ─── Bug S-1：汇总页交叉污染 ─────────────────────────────────────────────────
// wiki/sources/2023体检报告.md 实际写入了 高尿酸血症（2025来源）的内容
export const BUGGY_SUMMARY_2023_GETS_2025_CONCEPT = `---FILE: wiki/sources/2023体检报告.md---
---
type: concept
title: 高尿酸血症
created: 2026-04-19
updated: 2026-04-19
tags: [尿酸, 嘌呤代谢, 代谢风险]
related: [[2025体检报告]], [[肥胖]], [[血脂异常]], [[肾囊肿]]
sources: ["2025体检报告.pdf"]
---
# 定义

高尿酸血症是指血液中尿酸水平高于参考范围，常由尿酸生成增加、排泄减少或两者共同作用导致。
---END FILE---`

// wiki/sources/2025体检报告.md 实际写入了 2023体检报告 汇总的内容
export const BUGGY_SUMMARY_2025_GETS_2023_SUMMARY = `---FILE: wiki/sources/2025体检报告.md---
---
type: source
title: 2023体检报告
created: 2026-04-19
updated: 2026-04-19
tags: [体检报告, 年度体检, 代谢风险, 影像学异常, 随访]
related:
  - [[韩松]]
  - [[珠海奥乐医院]]
  - [[肥胖]]
  - [[高脂血症]]
  - [[轻度脂肪肝]]
  - [[ALT升高]]
  - [[肺结节]]
  - [[胆囊多发结石]]
  - [[双肾结石]]
  - [[甲状腺弥漫性回声改变]]
sources: ["2023体检报告.pdf"]
---
# 概要

《2023体检报告》是珠海奥乐医院出具的个人健康体检报告，体检对象为韩松，男，31岁。
---END FILE---`

// ─── Bug S-2：2023 source 内概念内容错位（ALT升高.md 写入了 韩松 实体内容）───
export const BUGGY_2023_ALT_GETS_HANSUNG_ENTITY = `---FILE: wiki/sources/2023体检报告/concepts/ALT升高.md---
---
type: entity
title: 韩松
created: 2026-04-19
updated: 2026-04-19
tags: [人物, 体检对象, 健康档案]
related:
  - [[2023体检报告]]
  - [[珠海奥乐医院]]
sources: ["2023体检报告.pdf"]
---
# 简介

韩松是《2023体检报告》中的体检对象。报告显示其为男性，31岁。
---END FILE---`

// ─── Bug S-3：2025 实体 韩松.md 标题正确但 sources 来自 2023 ─────────────────
export const BUGGY_2025_HANSUNG_WRONG_SOURCES = `---FILE: wiki/sources/2025体检报告/entities/韩松.md---
---
type: entity
title: 韩松
created: 2026-04-19
updated: 2026-04-19
tags: [人物, 体检对象, 健康档案]
related:
  - [[2023体检报告]]
  - [[珠海奥乐医院]]
sources: ["2023体检报告.pdf"]
---
# 简介

韩松是《2023体检报告》中的体检对象。报告显示其为男性，31岁。
---END FILE---`

// ─── Bug S-4：2025 血脂异常.md 标题和 sources 均来自 2023 ──────────────────────
export const BUGGY_2025_BLOOD_LIPIDS_GETS_2023_CONTENT = `---FILE: wiki/sources/2025体检报告/concepts/血脂异常.md---
---
type: concept
title: 高尿酸血症
created: 2026-04-19
updated: 2026-04-19
tags: [肾结石, 泌尿系统, 超声异常]
related:
  - [[2023体检报告]]
  - [[韩松]]
sources: ["2023体检报告.pdf"]
---
# 定义

双肾结石指左右两侧肾脏内均存在结石。
---END FILE---`
