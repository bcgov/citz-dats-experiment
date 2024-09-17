import { Worker } from 'worker_threads';

class WorkerPool {
  constructor(maxWorkers) {
    this.maxWorkers = maxWorkers;
    this.tasks = [];
    this.workers = [];
  }

  // Add a task to the queue and run it when a worker is available
  runTask(workerScript, workerData) {
    return new Promise((resolve, reject) => {
      this.tasks.push({ workerScript, workerData, resolve, reject });
      this.runNext();
    });
  }

  // Run the next task in the queue
  runNext() {
    if (this.tasks.length === 0 || this.workers.length >= this.maxWorkers) {
      return;
    }

    const { workerScript, workerData, resolve, reject } = this.tasks.shift(); // Get the next task from the queue
    const worker = new Worker(workerScript, { workerData });

    worker.on('message', resolve); // Resolve the promise when the worker sends a message
    worker.on('error', reject); // Reject the promise on error
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
      this.workers = this.workers.filter((w) => w !== worker); // Remove the worker from the active list
      this.runNext(); // Start the next task
    });

    this.workers.push(worker); // Add the worker to the active list
  }
}

export default WorkerPool;
