import { arbitrationCases, type ArbitrationCase, type InsertArbitrationCase } from "@shared/schema";
import { processedFiles, type ProcessedFile, type InsertProcessedFile } from "@shared/schema";
import { users, type User, type InsertUser } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods (keeping from original)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Arbitration cases methods
  getCases(page: number, limit: number, filter?: string): Promise<ArbitrationCase[]>;
  getCaseById(caseId: string): Promise<ArbitrationCase | undefined>;
  createCase(caseData: InsertArbitrationCase): Promise<ArbitrationCase>;
  updateCase(caseId: string, caseData: Partial<InsertArbitrationCase>): Promise<ArbitrationCase | undefined>;
  deleteCase(caseId: string): Promise<boolean>;
  getCaseCount(filter?: string): Promise<number>;
  
  // Processed files methods
  getProcessedFiles(): Promise<ProcessedFile[]>;
  getProcessedFileByName(filename: string): Promise<ProcessedFile | undefined>;
  createProcessedFile(fileData: InsertProcessedFile): Promise<ProcessedFile>;
  updateProcessedFile(id: number, fileData: Partial<InsertProcessedFile>): Promise<ProcessedFile | undefined>;
  deleteProcessedFile(filename: string): Promise<boolean>;
  
  // Stats methods
  getDataSummary(): Promise<{
    totalCases: number;
    aaa: number;
    jams: number;
    duplicates: number;
    missingData: number;
    totalAwardAmount: number;
    averageAwardAmount: number;
    highestAwardAmount: number;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private cases: Map<string, ArbitrationCase>;
  private files: Map<number, ProcessedFile>;
  userCurrentId: number;
  fileCurrentId: number;
  caseCurrentId: number;

  constructor() {
    this.users = new Map();
    this.cases = new Map();
    this.files = new Map();
    this.userCurrentId = 1;
    this.fileCurrentId = 1;
    this.caseCurrentId = 1;
  }

  // User methods (keeping from original)
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Arbitration cases methods
  async getCases(page: number, limit: number, filter?: string): Promise<ArbitrationCase[]> {
    let cases = Array.from(this.cases.values());
    
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      cases = cases.filter(c => 
        c.caseId.toLowerCase().includes(lowerFilter) ||
        c.forum.toLowerCase().includes(lowerFilter) ||
        (c.arbitratorName && c.arbitratorName.toLowerCase().includes(lowerFilter)) ||
        (c.claimantName && c.claimantName.toLowerCase().includes(lowerFilter)) ||
        (c.respondentName && c.respondentName.toLowerCase().includes(lowerFilter)) ||
        (c.disposition && c.disposition.toLowerCase().includes(lowerFilter))
      );
    }
    
    const start = (page - 1) * limit;
    const end = start + limit;
    
    return cases.slice(start, end);
  }

  async getCaseById(caseId: string): Promise<ArbitrationCase | undefined> {
    return this.cases.get(caseId);
  }

  async createCase(insertCase: InsertArbitrationCase): Promise<ArbitrationCase> {
    const id = this.caseCurrentId++;
    const newCase: ArbitrationCase = { 
      ...insertCase, 
      id,
      processingDate: new Date()
    };
    this.cases.set(newCase.caseId, newCase);
    return newCase;
  }

  async updateCase(caseId: string, caseData: Partial<InsertArbitrationCase>): Promise<ArbitrationCase | undefined> {
    const existingCase = this.cases.get(caseId);
    if (!existingCase) return undefined;
    
    const updatedCase: ArbitrationCase = { ...existingCase, ...caseData };
    this.cases.set(caseId, updatedCase);
    return updatedCase;
  }

  async deleteCase(caseId: string): Promise<boolean> {
    return this.cases.delete(caseId);
  }
  
  async getCaseCount(filter?: string): Promise<number> {
    if (!filter) return this.cases.size;
    
    const lowerFilter = filter.toLowerCase();
    const cases = Array.from(this.cases.values());
    const filteredCases = cases.filter(c => 
      c.caseId.toLowerCase().includes(lowerFilter) ||
      c.forum.toLowerCase().includes(lowerFilter) ||
      (c.arbitratorName && c.arbitratorName.toLowerCase().includes(lowerFilter)) ||
      (c.claimantName && c.claimantName.toLowerCase().includes(lowerFilter)) ||
      (c.respondentName && c.respondentName.toLowerCase().includes(lowerFilter)) ||
      (c.disposition && c.disposition.toLowerCase().includes(lowerFilter))
    );
    
    return filteredCases.length;
  }
  
  // Processed files methods
  async getProcessedFiles(): Promise<ProcessedFile[]> {
    return Array.from(this.files.values());
  }

  async getProcessedFileByName(filename: string): Promise<ProcessedFile | undefined> {
    return Array.from(this.files.values()).find(
      (file) => file.filename === filename,
    );
  }

  async createProcessedFile(insertFile: InsertProcessedFile): Promise<ProcessedFile> {
    const id = this.fileCurrentId++;
    const file: ProcessedFile = { 
      ...insertFile, 
      id,
      processingDate: new Date()
    };
    this.files.set(id, file);
    return file;
  }

  async updateProcessedFile(id: number, fileData: Partial<InsertProcessedFile>): Promise<ProcessedFile | undefined> {
    const existingFile = this.files.get(id);
    if (!existingFile) return undefined;
    
    const updatedFile: ProcessedFile = { ...existingFile, ...fileData };
    this.files.set(id, updatedFile);
    return updatedFile;
  }

  async deleteProcessedFile(filename: string): Promise<boolean> {
    const file = Array.from(this.files.values()).find(
      (file) => file.filename === filename,
    );
    if (!file) return false;
    
    return this.files.delete(file.id);
  }
  
  // Stats methods
  async getDataSummary(): Promise<{
    totalCases: number;
    aaa: number;
    jams: number;
    duplicates: number;
    missingData: number;
    totalAwardAmount: number;
    averageAwardAmount: number;
    highestAwardAmount: number;
  }> {
    const cases = Array.from(this.cases.values());
    const totalCases = cases.length;
    const aaaCases = cases.filter(c => c.forum === 'AAA').length;
    const jamsCases = cases.filter(c => c.forum === 'JAMS').length;
    const duplicates = cases.filter(c => c.status === 'DUPLICATE').length;
    
    // Count cases with missing critical data
    const missingData = cases.filter(c => 
      !c.arbitratorName || 
      !c.claimantName || 
      !c.respondentName ||
      !c.filingDate ||
      !c.disposition
    ).length;
    
    // Calculate award statistics
    let totalAwardAmount = 0;
    let highestAwardAmount = 0;
    let validAwardCount = 0;
    
    cases.forEach(c => {
      if (c.awardAmount && !isNaN(parseFloat(c.awardAmount))) {
        const amount = parseFloat(c.awardAmount);
        totalAwardAmount += amount;
        highestAwardAmount = Math.max(highestAwardAmount, amount);
        validAwardCount++;
      }
    });
    
    const averageAwardAmount = validAwardCount > 0 ? totalAwardAmount / validAwardCount : 0;
    
    return {
      totalCases,
      aaa: aaaCases,
      jams: jamsCases,
      duplicates,
      missingData,
      totalAwardAmount,
      averageAwardAmount,
      highestAwardAmount
    };
  }
}

export const storage = new MemStorage();
