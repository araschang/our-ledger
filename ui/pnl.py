"""📑 損益表 — 個人版 P&L：收入 → 固定 → 可支配 → 變動 → 淨存 ＋ 年度視圖"""
import streamlit as st

from lib import analytics
from ui._shared import (cat_detail, cat_label, empty_hint, fixed_cats, load,
                        person_colors, person_view)

st.title("📑 損益表")

ctx = load()
if ctx:
    cdf, meta, names = ctx["cdf"], ctx["meta"], ctx["names"]
    colors = person_colors(meta)
    fixed = fixed_cats(meta)
    sub = person_view(cdf, meta, key="pnl_view")
    view = st.session_state.get("pnl_view")
    view = None if view in (None, "all") else view
    if not empty_hint(sub):
        months = sorted(sub["month"].unique(), reverse=True)
        month = st.selectbox("月份", months, index=0)
        p = analytics.pnl(sub, fixed, month=month)
        idx = months.index(month)
        # 「vs 上月」只在日曆相鄰月才顯示，中間斷檔就不比
        y, mo = int(month[:4]), int(month[5:7])
        expect_prev = f"{y - 1}-12" if mo == 1 else f"{y}-{mo - 1:02d}"
        prev = (analytics.pnl(sub, fixed, month=expect_prev)
                if idx + 1 < len(months) and months[idx + 1] == expect_prev
                else None)

        def fmt(v):
            return f"CA&#36;{v:,.2f}"

        def delta(cur, pre, invert=False):
            if pre is None:
                return ""
            d = cur - pre
            if abs(d) < 0.005:
                return ""
            good = (d < 0) if invert else (d > 0)
            color = "#34A853" if good else "#E5484D"
            return (f'<span style="color:{color};font-size:0.78rem">'
                    f'{"+" if d > 0 else "−"}{abs(d):,.0f} vs 上月</span>')

        # ---- 指標列 ------------------------------------------------------
        c1, c2, c3 = st.columns(3)
        c1.metric("淨存", f"CA${p['net']:,.0f}",
                  delta=(f"{p['net'] - prev['net']:+,.0f}" if prev else None))
        c2.metric("儲蓄率",
                  "—" if p["save_rate"] is None else f"{p['save_rate']:.0%}",
                  help="淨存 ÷ 收入；沒記收入的月份算不出來")
        c3.metric("固定支出比率",
                  "—" if p["fixed_ratio"] is None else f"{p['fixed_ratio']:.0%}",
                  help="固定支出 ÷ 收入——生活結構健不健康看這個",
                  delta=(f"{(p['fixed_ratio'] - prev['fixed_ratio']) * 100:+.0f}pp"
                         if prev and p["fixed_ratio"] is not None
                         and prev["fixed_ratio"] is not None else None),
                  delta_color="inverse")

        # ---- 損益表本體 --------------------------------------------------
        with st.container(border=True, key="card_pl"):
            st.markdown(f'<div class="card-title">{int(month[5:7])}月損益表</div>',
                        unsafe_allow_html=True)

            def sec(label, amount, dl="", sign=""):
                """小計列（收入/固定支出/變動支出）。"""
                st.markdown(f'<div class="pl-sec"><span>{label}</span>'
                            f'<span class="pl-amt">{sign}{fmt(abs(amount))} '
                            f'{dl}</span></div>', unsafe_allow_html=True)

            def tot(label, amount):
                st.markdown(f'<div class="pl-tot"><span>{label}</span>'
                            f'<span class="pl-amt">{fmt(amount)}</span></div>',
                            unsafe_allow_html=True)

            def subs(by, tag):
                """分類細項：名字做成按鈕，點了看那一類這個月的每一筆。"""
                for c, v in by.items():
                    s1, s2 = st.columns([3, 2], vertical_alignment="center")
                    if s1.button(cat_label(c), key=f"plcat_{tag}_{c}",
                                 type="tertiary", help="點看明細"):
                        cat_detail(sub, c, names, colors, month=month,
                                   person=view)
                    s2.markdown(f'<div class="pl-num">{fmt(v)}</div>',
                                unsafe_allow_html=True)

            sec("收入", p["income"],
                delta(p["income"], prev["income"] if prev else None))
            subs(p["income_by"], "inc")
            sec("固定支出", p["fixed"],
                delta(p["fixed"], prev["fixed"] if prev else None, invert=True),
                sign="−")
            subs(p["fixed_by"], "fix")
            tot("可支配餘裕", p["disposable"])
            sec("變動支出", p["variable"],
                delta(p["variable"], prev["variable"] if prev else None,
                      invert=True), sign="−")
            subs(p["variable_by"], "var")
            sr = ("" if p["save_rate"] is None
                  else f'　<span class="card-sub">儲蓄率 {p["save_rate"]:.0%}</span>')
            tot(f"淨存{sr}", p["net"])
            st.caption("點分類名稱看那一類的明細；固定/變動的歸屬在「⚙️ 設定」調整。")

        # ---- 年度視圖 ----------------------------------------------------
        with st.container(border=True, key="card_year"):
            years = sorted({m[:4] for m in months}, reverse=True)
            y1, y2 = st.columns([1, 5])
            year = y1.selectbox("年度", years, label_visibility="collapsed")
            y2.markdown(f'<div class="card-title" style="margin-top:0.4rem">'
                        f'{year} 年度視圖</div>', unsafe_allow_html=True)
            ydf = analytics.pnl_yearly(sub, fixed, year)
            body = ""
            for r in ydf.itertuples():
                sr_txt = "—" if r.save_rate is None or r.save_rate != r.save_rate \
                    else f"{r.save_rate:.0%}"
                net_color = "#34A853" if r.net >= 0 else "#E5484D"
                body += (f'<tr><td>{int(r.month[5:7])}月</td>'
                         f'<td class="amt">{fmt(r.income)}</td>'
                         f'<td class="amt">{fmt(r.fixed)}</td>'
                         f'<td class="amt">{fmt(r.variable)}</td>'
                         f'<td class="amt" style="color:{net_color}">{fmt(r.net)}</td>'
                         f'<td class="mut">{sr_txt}</td></tr>')
            ti, tf, tv, tn = (ydf["income"].sum(), ydf["fixed"].sum(),
                              ydf["variable"].sum(), ydf["net"].sum())
            tsr = "—" if ti <= 0 else f"{tn / ti:.0%}"
            body += (f'<tr class="tot"><td>合計</td>'
                     f'<td class="amt">{fmt(ti)}</td><td class="amt">{fmt(tf)}</td>'
                     f'<td class="amt">{fmt(tv)}</td><td class="amt">{fmt(tn)}</td>'
                     f'<td class="mut">{tsr}</td></tr>')
            st.markdown('<div class="tbl-scroll"><table class="dt"><thead><tr>'
                        '<th>月份</th><th>收入</th>'
                        '<th>固定支出</th><th>變動支出</th><th>淨存</th>'
                        '<th>儲蓄率</th></tr></thead>'
                        f'<tbody>{body}</tbody></table></div>',
                        unsafe_allow_html=True)
