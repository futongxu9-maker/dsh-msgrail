/**
 * Browser half of MsgRail: a message-index rail pinned to the right edge of the
 * conversation. One brand-colored dot per user message, vertically distributed
 * in a scrollable 300px zone with fade-out at both ends; hover enlarges a dot
 * and opens a preview card; click jumps to the message (auto-loading older
 * messages when the target is not yet rendered).
 *
 * Data comes from GET /api/msgrail/messages (registered by lib/index.js), so
 * the rail survives page reloads, new conversations, and server restarts.
 * Loaded by the web app through the dsh.client protocol.
 */
window.__ModuleLoader__.load({
	id: "@local/dsh-msgrail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");
		let createElement = react.createElement;

		const API = "/api/msgrail/messages";

		const CSS = `
.dsh-msgrail-hit { position:fixed; z-index:2147483000; pointer-events:auto; overflow-y:auto; scrollbar-width:none; }
.dsh-msgrail-hit::-webkit-scrollbar { display:none; }
.dsh-msgrail-dot { position:absolute; transform:translate(-50%,-50%); border-radius:50%; cursor:pointer; transition:width 160ms ease, height 160ms ease, background 120ms ease, opacity 160ms ease; }
.dsh-msgrail-dot-idle { background:color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 35%, transparent); }
.dsh-msgrail-dot-latest { background:color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 85%, transparent); }
.dsh-msgrail-dot-active { background:var(--dsw-alias-brand-primary, #4d6bfe); }
.dsh-msgrail-preview { position:fixed; z-index:2147483000; pointer-events:none; width:300px; max-height:210px; overflow:hidden; padding:12px 14px; border-radius:12px; background:var(--dsw-alias-bg-overlay, #ffffff); border:1px solid var(--dsw-alias-border-l1, rgba(17,19,24,.08)); box-shadow:0 12px 32px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06); font-size:13px; line-height:20px; color:var(--dsw-alias-label-primary, #111318); animation:dsh-msgrail-preview-in 140ms ease-out; }
.dsh-msgrail-preview-time { display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:11px; line-height:16px; letter-spacing:.02em; color:var(--dsw-alias-label-secondary, #5b6472); }
.dsh-msgrail-preview-dot { flex:none; width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-brand-primary, #4d6bfe); opacity:.85; }
.dsh-msgrail-preview-text { white-space:pre-wrap; word-break:break-word; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
@keyframes dsh-msgrail-preview-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
`;

		function MsgRail(props) {
			const useSessions = props.useSessions;
			const current = useSessions((s) => s.current);
			const [items, setItems] = react.useState([]);
			const [hovered, setHovered] = react.useState(-1);
			const [scrollTop, setScrollTop] = react.useState(0);
			const [box, setBox] = react.useState(null);
			const [retry, setRetry] = react.useState(null);
			// 数据签名缓存：轮询结果无变化不重渲染（避免切冷会话时的卡顿）
			const lastSig = react.useRef("");
			// 最后已知几何：切会话瞬间消息流元素未挂载时沿用（布局列位置稳定）
			const lastBoxRef = react.useRef(null);

			const load = () => {
				if (!current) { setItems([]); lastSig.current = ""; return; }
				fetch(API + "?sessionId=" + encodeURIComponent(current))
					.then((r) => r.json())
					.then((res) => {
						if (!res || !res.ok || !Array.isArray(res.items)) return;
						const sig = res.items.map((x) => x.seq + ":" + x.time).join(",");
						if (sig === lastSig.current) return;
						lastSig.current = sig;
						setItems(res.items);
					})
					.catch(() => {});
			};

			react.useEffect(() => { setItems([]); load(); }, [current]);

			// 3s 轮询：新消息/流式期间自动长出新圆点
			react.useEffect(() => {
				if (!current) return undefined;
				const id = window.setInterval(load, 3000);
				return () => window.clearInterval(id);
			}, [current]);

			// 对话区几何：视口内固定滚动容器优先；消息流元素未挂载时沿用
			// 上次 box（布局列位置稳定），MutationObserver 等元素出现再更新。
			react.useEffect(() => {
				const findEl = () => {
					const scrollHost = document.querySelector("[data-conversation-scroll]");
					if (scrollHost) return scrollHost;
					return document.querySelector("[data-chat-flow]") || null;
				};
				const bind = (el) => {
					const isHost = el.hasAttribute ? el.hasAttribute("data-conversation-scroll") : false;
					const update = () => {
						const r = el.getBoundingClientRect();
						const left = Math.max(0, r.left);
						const top = Math.max(0, r.top);
						const bottom = Math.min(window.innerHeight, r.bottom);
						const right = Math.min(window.innerWidth, r.right);
						const b = { left, top, height: Math.max(0, bottom - top), width: Math.max(0, right - left) };
						setBox(b);
						lastBoxRef.current = b;
					};
					update();
					const ro = new ResizeObserver(update);
					ro.observe(el);
					window.addEventListener("resize", update);
					const onScroll = () => update();
					if (!isHost) window.addEventListener("scroll", onScroll, true);
					return () => {
						ro.disconnect();
						window.removeEventListener("resize", update);
						window.removeEventListener("scroll", onScroll, true);
					};
				};
				if (!current) { setBox(null); return undefined; }
				const el = findEl();
				if (el) return bind(el);
				// 消息流未挂载：沿用上次 box 立即渲染，等元素出现再绑定
				if (lastBoxRef.current) setBox(lastBoxRef.current);
				const mo = new MutationObserver(() => {
					const e2 = findEl();
					if (e2) { mo.disconnect(); bind(e2); }
				});
				mo.observe(document.body, { childList: true, subtree: true });
				return () => mo.disconnect();
			}, [current]);

			// 未加载消息的跳转重试：点「加载更早」逐页追目标；找到目标后
			// 进入可见性确认循环——ChatView 的滚动锚点机制会纠正程序化滚动，
			// 所以滚动后检查目标是否真的在视口内，不在就继续滚。
			react.useEffect(() => {
				if (!retry) return undefined;
				const found = () => document.querySelector('[data-chat-anchor-key="' + retry.key + '"]');
				if (retry.tries >= 600) { setRetry(null); return undefined; }
				const el = found();
				if (el) {
					el.scrollIntoView({ block: "start" });
					const r = el.getBoundingClientRect();
					const visible = r.top >= -20 && r.top <= window.innerHeight - 40;
					if (visible) { setRetry(null); return undefined; }
					const id = window.setTimeout(() => setRetry({ key: retry.key, tries: retry.tries + 1 }), 150);
					return () => window.clearTimeout(id);
				}
				// 加载阶段 200ms 高频轮询：按钮一恢复立即点下一页，逐页追目标
				const btn = Array.from(document.querySelectorAll("button")).find((b) => /加载更早/.test(b.textContent || ""));
				if (btn && !btn.disabled) btn.click();
				const id = window.setTimeout(() => setRetry({ key: retry.key, tries: retry.tries + 1 }), 200);
				return () => window.clearTimeout(id);
			}, [retry]);

			const jump = (i) => {
				const it = items[i];
				if (!it) return;
				const key = "13:input-message" + it.id;
				const found = () => document.querySelector('[data-chat-anchor-key="' + key + '"]');
				const el = found();
				if (el) {
					el.scrollIntoView({ block: "start" });
					window.setTimeout(() => { const el2 = found(); if (el2) el2.scrollIntoView({ block: "start" }); }, 150);
					return;
				}
				const scrollHost = document.querySelector("[data-conversation-scroll]");
				if (scrollHost) scrollHost.scrollTop = 0;
				setRetry({ key, tries: 0 });
			};

			if (!current || !box || items.length === 0) return null;

			const n = items.length;
			const cx = box.left + box.width - 44;
			const HIT_W = 48;
			const AREA_H = Math.min(300, Math.max(120, box.height - 96));
			const ROW = 26;
			const areaTop = box.top + Math.max(24, (box.height - AREA_H) / 2);
			const areaLeft = cx - HIT_W / 2;
			const half = AREA_H / 2;

			const fmt = (t) => {
				const d = new Date(t);
				const p = (v) => String(v).padStart(2, "0");
				return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + p(d.getHours()) + ":" + p(d.getMinutes());
			};

			// 预览只在 hover 的圆点位于可视区（含半可见边缘）时渲染
			let preview = null;
			if (hovered >= 0 && hovered < n) {
				const yInView = hovered * ROW + ROW / 2 - scrollTop;
				if (yInView >= -8 && yInView <= AREA_H + 8) {
					preview = createElement("div", {
						className: "dsh-msgrail-preview",
						style: {
							left: (cx - 10 - 300) + "px",
							top: Math.max(8, Math.min(window.innerHeight - 220, areaTop + yInView - 10)) + "px",
						},
					},
						createElement("div", { className: "dsh-msgrail-preview-time" },
							createElement("span", { className: "dsh-msgrail-preview-dot" }),
							fmt(items[hovered].time),
						),
						createElement("div", { className: "dsh-msgrail-preview-text" }, items[hovered].text || "(无文本)"),
					);
				}
			}

			return createElement(react.Fragment, null,
				createElement("div", {
					className: "dsh-msgrail-hit",
					style: { left: areaLeft + "px", top: areaTop + "px", width: HIT_W + "px", height: AREA_H + "px" },
					onScroll: (e) => {
						const st = e.currentTarget.scrollTop;
						setScrollTop(st);
						if (hovered >= 0) {
							const y = hovered * ROW + ROW / 2 - st;
							if (y < 4 || y > AREA_H - 4) setHovered(-1);
						}
					},
				},
					createElement("div", { style: { position: "relative", height: (n * ROW) + "px" } },
						items.map((it, i) => {
							const active = i === hovered;
							const size = active ? 17 : (i === n - 1 ? 13 : 11);
							const yInView = i * ROW + ROW / 2 - scrollTop;
							const dist = Math.min(1, Math.abs(yInView - half) / half);
							const opacity = active ? 1 : 1 - 0.65 * dist;
							// 整行承载 hover/点击（ROW 高，命中面积大），圆点视觉居中
							return createElement("div", {
								key: it.seq,
								role: "button",
								"aria-label": "跳转到消息：" + fmt(it.time),
								style: {
									position: "absolute", left: 0, right: 0,
									top: (i * ROW) + "px", height: ROW + "px",
									cursor: "pointer",
								},
								onMouseEnter: () => setHovered(i),
								onMouseLeave: () => setHovered(-1),
								onClick: () => jump(i),
							}, createElement("div", {
								className: "dsh-msgrail-dot " + (active ? "dsh-msgrail-dot-active" : (i === n - 1 ? "dsh-msgrail-dot-latest" : "dsh-msgrail-dot-idle")),
								style: {
									left: (HIT_W / 2) + "px",
									top: (ROW / 2) + "px",
									width: size + "px",
									height: size + "px",
									opacity,
								},
							}));
						}),
					),
				),
				preview,
			);
		}

		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			const head = document.head || document.documentElement;
			let styleEl = document.getElementById("dsh-msgrail-style");
			if (styleEl === null) {
				styleEl = document.createElement("style");
				styleEl.id = "dsh-msgrail-style";
				styleEl.textContent = CSS;
				head.appendChild(styleEl);
			}
			slots.inject("shell.overlay", () => slots.register(
				{ name: "shell.overlay", id: "msg-rail", order: 20 },
				(props) => createElement(MsgRail, props),
			));
		}

		exports.apply = apply;
		exports.name = "msgrail";
		return module.exports;
	}
});
