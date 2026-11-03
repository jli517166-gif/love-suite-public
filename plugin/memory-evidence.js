/** Shared conservative interpretation guidance; semantic correctness still needs model/output review. */
export const MEMORY_EVIDENCE_GUIDE = `单次互动只证明本次发生，不能自行提升为稳定偏好、身份、长期关系、双方默认边界或第一次经历。没有覆盖相关历史的证据时，不写“第一次”“一直”“稳定”“已经形成”；可明确写“本轮表达/这次尝试”。用户明确陈述的长期偏好和边界仍可按原话记录。创建核心的名称由你决定，但单个事件不证明稳定性，先复用已有相关核心，证据不足不制造里程碑。
一条用户消息不能同时证明助手自己的感受、动作或承诺。确有长期价值时，用户表达单独用其conversation来源；助手当时的回应或自我理解另用实际assistant来源的reflection+inferred，保留“当时自述”，不得代替用户同意。普通附和/角色扮演无需逐句存储，更不能把自己的回应推导成用户的现实属性。材料缺失则保留不确定性，不能补写。不要储存已脱敏占位符或据此猜测凭据。所有新增create_core、record_memory、link的ref值都必须以$开头且同批唯一，例如"ref":"$memory1"，不是"memory1"。`;
