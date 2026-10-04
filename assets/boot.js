async function bootGjt() {
  if (!DATAPIPE_EXPERIMENT_ID.trim()) {
    document.body.textContent = "保存先が未設定です。担当者に連絡してください。課題は開始できません。";
    return;
  }
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches) {
    document.body.textContent = "この課題はPCのキーボードで実施します。CALL教室のPCを使用してください。";
    return;
  }
  for (const file of ["stimuli.js", "experiment.js"]) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "../assets/" + file;
      script.onload = resolve; script.onerror = reject; document.body.appendChild(script);
    });
  }
}
bootGjt().catch(() => { document.body.textContent = "読み込みに失敗しました。担当者に連絡してください。"; });
