import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from "../../auth/entities/user.entity";
import { DiagramSession } from "../../diagram-session/entities/diagram-session.entity";

@Entity()
export class Diagram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('jsonb')
  content: any;

  @ManyToOne(() => User, user => user.diagrams)
  owner: User;

  @OneToMany(() => DiagramSession, session => session.diagram, { cascade: true })
  sessions: DiagramSession[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}