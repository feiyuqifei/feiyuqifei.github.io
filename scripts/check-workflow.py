"""
GitHub Actions 工作流的结构校验（不需要 PyYAML）。

为什么手写而不是装 PyYAML：CI 流程本身用不到 PyYAML，
为了一次性检查往项目里加依赖不划算。这里只校验对部署成败有影响的要点：
  - 缩进是否一致（制表符是 YAML 禁止的）
  - 关键字段是否存在
  - 权限是否齐全（缺 pages/id-token 会导致部署 403）
  - 动作版本是否填了
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WF = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "deploy.yml"

errors: list[str] = []
warnings: list[str] = []
checks: list[tuple[bool, str]] = []


def check(ok: bool, label: str) -> None:
    checks.append((ok, label))
    if not ok:
        errors.append(label)


def main() -> int:
    if not WF.exists():
        print(f"找不到工作流文件: {WF}")
        return 2

    text = WF.read_text(encoding="utf-8")
    lines = text.splitlines()

    print(f"检查文件: {WF.name}  ({len(lines)} 行)\n")

    # 1. YAML 禁止制表符
    tabs = [i + 1 for i, l in enumerate(lines) if "\t" in l]
    check(not tabs, f"无制表符缩进 (YAML 禁止 Tab){'' if not tabs else f' — 行 {tabs}'}")

    # 2. 顶层键
    for key in ("name:", "on:", "permissions:", "concurrency:", "jobs:"):
        check(
            any(l.startswith(key) for l in lines),
            f"存在顶层键 {key}",
        )

    # 3. 权限（缺 pages / id-token 会在 deploy 步骤 403）
    perm_block = ""
    in_perm = False
    for l in lines:
        if l.startswith("permissions:"):
            in_perm = True
            continue
        if in_perm:
            if l.startswith(" ") and l.strip():
                perm_block += l
            elif l.strip() and not l.startswith(" "):
                break
    for perm in ("contents: read", "pages: write", "id-token: write"):
        check(perm in perm_block, f"权限包含 {perm}")

    # 4. 两个 job
    check("  build:" in text, "存在 build job")
    check("  deploy:" in text, "存在 deploy job")
    check("needs: build" in text, "deploy job 依赖 build")

    # 5. 用到的 actions 都带版本标签
    uses = re.findall(r"uses:\s*([^\s#]+)", text)
    check(len(uses) > 0, f"共引用 {len(uses)} 个 action")
    for u in uses:
        ok = "@" in u and not u.endswith("@")
        check(ok, f"action 带版本: {u}")

    # 6. pnpm 大版本必须 >= 11（pnpm-workspace.yaml 用了 allowBuilds）
    m = re.search(r"version:\s*(\d+)", text)
    if m:
        major = int(m.group(1))
        check(major >= 11, f"pnpm 版本 >= 11 (实际 {major})")
    else:
        errors.append("未找到 pnpm version")

    # 7. Node 版本满足 engines 与 Astro 7 的 >=22.12
    m = re.search(r"node-version:\s*([\d.]+)", text)
    if m:
        check(m.group(1) == "22", f"Node 版本 = 22 (实际 {m.group(1)})")
    else:
        errors.append("未找到 node-version")

    # 8. 关键步骤
    check("pnpm install --frozen-lockfile" in text, "使用 --frozen-lockfile 安装")
    check("pnpm run build" in text, "执行 pnpm run build")
    check("upload-pages-artifact" in text, "上传 Pages 产物")
    check("deploy-pages" in text, "部署到 Pages")
    check("configure-pages" in text, "调用 configure-pages")

    # 9. 触发条件
    check("branches: [main]" in text, "push 到 main 触发")
    check("workflow_dispatch" in text, "支持手动触发")

    # 输出（用 ASCII 标记，避免 Windows 控制台 GBK 编码无法输出 ✓ 而报错）
    for ok, label in checks:
        print(f"  {'[OK]  ' if ok else '[FAIL]'} {label}")

    print()
    if warnings:
        print("提示:")
        for w in warnings:
            print(f"  ! {w}")
    if errors:
        print(f"结果: {len(errors)} 项未通过")
        return 1
    print(f"结果: 全部 {len(checks)} 项通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
