import { 
  arbitrationCases, 
  processedFiles, 
  users, 
  type ArbitrationCase, 
  type InsertArbitrationCase,
  type ProcessedFile, 
  type InsertProcessedFile,
  type User, 
  type InsertUser 
} from "@shared/schema";
import { db } from "./db";
import { eq, like, desc, sql, and, or, isNull, isNotNull } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods (keeping from original)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Arbitration cases methods
  getCases(page: number, limit: number, filter?: string, sortField?: string, sortOrder?: 'asc' | 'desc'): Promise<ArbitrationCase[]>;
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

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  // Arbitration cases methods
  async getCases(page: number, limit: number, filter?: string, sortField?: string, sortOrder?: 'asc' | 'desc'): Promise<ArbitrationCase[]> {
    const offset = (page - 1) * limit;
    
    // Create a query builder for basic select
    let queryBuilder = db.select().from(arbitrationCases);
    
    if (filter) {
      // Process filter string to see if it contains our special filters
      const filterParts = filter.split(' ');
      const conditions: any[] = [];
            
      for (const part of filterParts) {
        if (part.includes(':')) {
          // Process specific field filter (format: "field:value")
          const [field, ...valueParts] = part.split(':');
          let value = valueParts.join(':');
          
          switch (field.toLowerCase()) {
            case 'arbitrator':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.arbitratorName}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'respondent':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.respondentName}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'casetype':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.caseType}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'disposition':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.disposition}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'attorney':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.consumerAttorney}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'forum':
              conditions.push(like(sql`lower(${arbitrationCases.forum})`, `%${value.toLowerCase()}%`));
              break;
            case 'date':
              // Format: date:startDate:endDate (either can be empty)
              const dateParts = value.split(':');
              const startDate = dateParts[0] ? new Date(dateParts[0]) : null;
              const endDate = dateParts[1] ? new Date(dateParts[1]) : null;
              
              if (startDate && !isNaN(startDate.getTime())) {
                conditions.push(sql`${arbitrationCases.filingDate} >= ${startDate}`);
              }
              
              if (endDate && !isNaN(endDate.getTime())) {
                // Add one day to include the end date fully
                const nextDay = new Date(endDate);
                nextDay.setDate(nextDay.getDate() + 1);
                conditions.push(sql`${arbitrationCases.filingDate} < ${nextDay}`);
              }
              break;
            default:
              // If not a special filter, treat it as a general search term
              const lowerFilter = `%${part.toLowerCase()}%`;
              conditions.push(
                or(
                  like(sql`lower(${arbitrationCases.caseId})`, lowerFilter),
                  like(sql`lower(${arbitrationCases.forum})`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.arbitratorName}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.respondentName}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.consumerAttorney}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.disposition}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.caseType}, ''))`, lowerFilter)
                )
              );
          }
        } else if (part.trim()) {
          // If it's a regular search term (not field:value format)
          const lowerFilter = `%${part.toLowerCase()}%`;
          conditions.push(
            or(
              like(sql`lower(${arbitrationCases.caseId})`, lowerFilter),
              like(sql`lower(${arbitrationCases.forum})`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.arbitratorName}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.respondentName}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.consumerAttorney}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.disposition}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.caseType}, ''))`, lowerFilter)
            )
          );
        }
      }
      
      // Apply all conditions with AND
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }
    }
    
    // Apply sorting if sortField is provided
    if (sortField) {
      // Map frontend sortField names to database columns
      const columnMap: Record<string, any> = {
        'caseId': arbitrationCases.caseId,
        'arbitratorName': arbitrationCases.arbitratorName,
        'respondentName': arbitrationCases.respondentName,
        'consumerAttorney': arbitrationCases.consumerAttorney,
        'disposition': arbitrationCases.disposition,
        'claimAmount': arbitrationCases.claimAmount,
        'awardAmount': arbitrationCases.awardAmount,
        'filingDate': arbitrationCases.filingDate,
        'caseType': arbitrationCases.caseType,
        'forum': arbitrationCases.forum
      };
      
      const column = columnMap[sortField];
      if (column) {
        // Special handling for columns that might contain NULL values
        if (['consumerAttorney', 'arbitratorName', 'respondentName', 'disposition', 'claimAmount', 
             'awardAmount', 'filingDate', 'caseType'].includes(sortField)) {
          if (sortOrder === 'desc') {
            // Put non-null values first, then nulls
            queryBuilder = queryBuilder.orderBy(sql`COALESCE(${column}, '') DESC NULLS LAST`);
          } else {
            // Put nulls last when sorting ascending
            queryBuilder = queryBuilder.orderBy(sql`COALESCE(${column}, '') ASC NULLS LAST`);
          }
        } else {
          // Normal column sorting for non-nullable columns
          if (sortOrder === 'desc') {
            queryBuilder = queryBuilder.orderBy(desc(column));
          } else {
            queryBuilder = queryBuilder.orderBy(column);
          }
        }
      } else {
        // Default sorting if the column doesn't exist
        queryBuilder = queryBuilder.orderBy(desc(arbitrationCases.processingDate));
      }
    } else {
      // Default sorting if no sort field provided
      queryBuilder = queryBuilder.orderBy(desc(arbitrationCases.processingDate));
    }
    
    // Execute the query with limit and offset
    return await queryBuilder.limit(limit).offset(offset);
  }

  async getCaseById(caseId: string): Promise<ArbitrationCase | undefined> {
    const [arbitrationCase] = await db
      .select()
      .from(arbitrationCases)
      .where(eq(arbitrationCases.caseId, caseId));
    
    return arbitrationCase;
  }

  async createCase(insertCase: InsertArbitrationCase): Promise<ArbitrationCase> {
    const [arbitrationCase] = await db
      .insert(arbitrationCases)
      .values(insertCase)
      .returning();
    
    return arbitrationCase;
  }

  async updateCase(caseId: string, caseData: Partial<InsertArbitrationCase>): Promise<ArbitrationCase | undefined> {
    const [updatedCase] = await db
      .update(arbitrationCases)
      .set(caseData)
      .where(eq(arbitrationCases.caseId, caseId))
      .returning();
    
    return updatedCase;
  }

  async deleteCase(caseId: string): Promise<boolean> {
    const result = await db
      .delete(arbitrationCases)
      .where(eq(arbitrationCases.caseId, caseId))
      .returning();
    
    return result.length > 0;
  }
  
  async getCaseCount(filter?: string): Promise<number> {
    // Create a query builder for counting
    let queryBuilder = db.select({ count: sql`count(*)` }).from(arbitrationCases);
    
    if (filter) {
      // Process filter string to see if it contains our special filters
      const filterParts = filter.split(' ');
      const conditions: any[] = [];
            
      for (const part of filterParts) {
        if (part.includes(':')) {
          // Process specific field filter (format: "field:value")
          const [field, ...valueParts] = part.split(':');
          let value = valueParts.join(':');
          
          switch (field.toLowerCase()) {
            case 'arbitrator':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.arbitratorName}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'respondent':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.respondentName}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'casetype':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.caseType}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'disposition':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.disposition}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'attorney':
              conditions.push(like(sql`lower(coalesce(${arbitrationCases.consumerAttorney}, ''))`, `%${value.toLowerCase()}%`));
              break;
            case 'forum':
              conditions.push(like(sql`lower(${arbitrationCases.forum})`, `%${value.toLowerCase()}%`));
              break;
            case 'date':
              // Format: date:startDate:endDate (either can be empty)
              const dateParts = value.split(':');
              const startDate = dateParts[0] ? new Date(dateParts[0]) : null;
              const endDate = dateParts[1] ? new Date(dateParts[1]) : null;
              
              if (startDate && !isNaN(startDate.getTime())) {
                conditions.push(sql`${arbitrationCases.filingDate} >= ${startDate}`);
              }
              
              if (endDate && !isNaN(endDate.getTime())) {
                // Add one day to include the end date fully
                const nextDay = new Date(endDate);
                nextDay.setDate(nextDay.getDate() + 1);
                conditions.push(sql`${arbitrationCases.filingDate} < ${nextDay}`);
              }
              break;
            default:
              // If not a special filter, treat it as a general search term
              const lowerFilter = `%${part.toLowerCase()}%`;
              conditions.push(
                or(
                  like(sql`lower(${arbitrationCases.caseId})`, lowerFilter),
                  like(sql`lower(${arbitrationCases.forum})`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.arbitratorName}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.respondentName}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.consumerAttorney}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.disposition}, ''))`, lowerFilter),
                  like(sql`lower(coalesce(${arbitrationCases.caseType}, ''))`, lowerFilter)
                )
              );
          }
        } else if (part.trim()) {
          // If it's a regular search term (not field:value format)
          const lowerFilter = `%${part.toLowerCase()}%`;
          conditions.push(
            or(
              like(sql`lower(${arbitrationCases.caseId})`, lowerFilter),
              like(sql`lower(${arbitrationCases.forum})`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.arbitratorName}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.respondentName}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.consumerAttorney}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.disposition}, ''))`, lowerFilter),
              like(sql`lower(coalesce(${arbitrationCases.caseType}, ''))`, lowerFilter)
            )
          );
        }
      }
      
      // Apply all conditions with AND
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }
    }
    
    // Execute the query and get count
    const [result] = await queryBuilder;
    return Number(result?.count || 0);
  }
  
  // Processed files methods
  async getProcessedFiles(): Promise<ProcessedFile[]> {
    return db.select().from(processedFiles).orderBy(desc(processedFiles.processingDate));
  }

  async getProcessedFileByName(filename: string): Promise<ProcessedFile | undefined> {
    const [file] = await db
      .select()
      .from(processedFiles)
      .where(eq(processedFiles.filename, filename));
    
    return file;
  }

  async createProcessedFile(insertFile: InsertProcessedFile): Promise<ProcessedFile> {
    const [file] = await db
      .insert(processedFiles)
      .values(insertFile)
      .returning();
    
    return file;
  }

  async updateProcessedFile(id: number, fileData: Partial<InsertProcessedFile>): Promise<ProcessedFile | undefined> {
    const [updatedFile] = await db
      .update(processedFiles)
      .set(fileData)
      .where(eq(processedFiles.id, id))
      .returning();
    
    return updatedFile;
  }

  async deleteProcessedFile(filename: string): Promise<boolean> {
    const result = await db
      .delete(processedFiles)
      .where(eq(processedFiles.filename, filename))
      .returning();
    
    return result.length > 0;
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
    // Get total cases count
    const [totalResult] = await db
      .select({ count: sql`count(*)` })
      .from(arbitrationCases);
    const totalCases = Number(totalResult?.count || 0);
    
    // Get AAA cases count - use case-insensitive matching
    const [aaaResult] = await db
      .select({ count: sql`count(*)` })
      .from(arbitrationCases)
      .where(sql`UPPER(${arbitrationCases.forum}) = 'AAA'`);
    const aaaCases = Number(aaaResult?.count || 0);
    
    // Get JAMS cases count - use case-insensitive matching
    const [jamsResult] = await db
      .select({ count: sql`count(*)` })
      .from(arbitrationCases)
      .where(sql`UPPER(${arbitrationCases.forum}) = 'JAMS'`);
    const jamsCases = Number(jamsResult?.count || 0);
    
    // Get duplicates count
    const [duplicatesResult] = await db
      .select({ count: sql`count(*)` })
      .from(arbitrationCases)
      .where(isNotNull(arbitrationCases.duplicateOf));
    const duplicates = Number(duplicatesResult?.count || 0);
    
    // Count cases with missing critical data
    const [missingDataResult] = await db
      .select({ count: sql`count(*)` })
      .from(arbitrationCases)
      .where(
        or(
          isNull(arbitrationCases.arbitratorName),
          isNull(arbitrationCases.respondentName),
          isNull(arbitrationCases.consumerAttorney),
          isNull(arbitrationCases.filingDate),
          isNull(arbitrationCases.disposition)
        )
      );
    const missingData = Number(missingDataResult?.count || 0);
    
    // Get award amount statistics
    // We need to cast awardAmount to numeric for calculations with careful validation
    // Filter for cases where disposition is "AWARD" (case-insensitive)
    const awardStats = await db.execute(sql`
      SELECT 
        SUM(CASE WHEN ${arbitrationCases.awardAmount} ~ '^[0-9]+(\.[0-9]+)?$' 
            THEN ${arbitrationCases.awardAmount}::numeric 
            ELSE 0 END) as total_amount,
        AVG(CASE WHEN ${arbitrationCases.awardAmount} ~ '^[0-9]+(\.[0-9]+)?$' 
            THEN ${arbitrationCases.awardAmount}::numeric 
            ELSE null END) as avg_amount,
        MAX(CASE WHEN ${arbitrationCases.awardAmount} ~ '^[0-9]+(\.[0-9]+)?$' 
            THEN ${arbitrationCases.awardAmount}::numeric 
            ELSE 0 END) as max_amount,
        COUNT(CASE WHEN ${arbitrationCases.awardAmount} ~ '^[0-9]+(\.[0-9]+)?$' 
            THEN 1 
            ELSE null END) as valid_count
      FROM ${arbitrationCases}
      WHERE ${arbitrationCases.awardAmount} IS NOT NULL 
      AND ${arbitrationCases.duplicateOf} IS NULL
      AND LOWER(${arbitrationCases.disposition}) LIKE '%award%'
    `);
    
    // Parse award statistics results
    const stats = awardStats.rows[0];
    const totalAwardAmount = Number(stats?.total_amount || 0);
    const averageAwardAmount = Number(stats?.avg_amount || 0);
    const highestAwardAmount = Number(stats?.max_amount || 0);
    
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

export const storage = new DatabaseStorage();
