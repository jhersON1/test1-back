import { Column, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Diagram } from "../../diagram/entities/diagram.entity";
import { User } from "../../auth/entities/user.entity";

@Entity()
export class DiagramSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({nullable: true})
  hostId: string;

  @ManyToOne(() => Diagram, diagram => diagram.sessions)
  diagram: Diagram;

  @ManyToMany(() => User)
  @JoinTable()
  participants: User[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}
