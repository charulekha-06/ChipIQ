# ChipIQ: AI-Powered Verification Platform

ChipIQ is a next-generation semiconductor verification platform designed to accelerate the chip design and testing lifecycle. It provides an intelligent, role-based dashboard to visualize RTL risks, coverage trends, and real-time simulator logs, enhanced with AI-driven root cause analysis and generative testbench creation.

---

## 🔄 The Role Pipeline & Feedback Loop

The platform operates on a continuous data flywheel driven by four distinct user roles, forming a clockwise operational pipeline:

### 1. Admin (The Configuration Layer)
Admin sits at the top — they configure the data pipeline, run ARIMA/LSTM/Prophet models, and generate the bug predictions and risk scores that the rest of the system depends on. Their output flows down to the Engineer.

### 2. Engineer (The Execution Layer)
Engineers are the data generators. They consume the predictions (via RTL Analysis, Bug Prediction, Verif Intel, and Simulator tabs) and act on them — fixing bugs, running test cycles, and improving coverage. Every action they take generates new data: new bugs discovered, coverage percentages updated, commit history growing. This new data feeds back up to Admin/ML to retrain the models.

### 3. Project Lead (The Bridge)
The Project Lead bridges execution and strategy. They have access to everything Engineers see, plus Tapeout and Reports. They watch Engineer progress, decide which module gets priority (e.g. assigning 3 engineers to `USB_PHY` because the risk score is 94), and report status upward to the Manager. The Lead actively guides Engineers based on what they see.

### 4. Manager (The Outcome Layer)
The Manager only sees the outcome, not the details. Dashboard, Tapeout readiness, Reports — that's their world. They don't need RTL Analysis or the Simulator. When they approve extra resources (more engineers, more test cycles), that decision flows back down to the Lead, then to Engineers.

### ♾️ The Core Feedback Loop
The most important dynamic is the feedback loop: New data from Engineers flows back into the system, models retrain, predictions improve, and Engineers get better guidance the next cycle. This is why ChipIQ improves continuously rather than being a static reporting tool. **Each role depends on every other role to do their job well.**

---

## 🚀 Getting Started

To run the development server locally:

```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

Navigate to `http://localhost:5173` to view the application in your browser.
